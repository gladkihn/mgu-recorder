#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <pthread.h>
#include <signal.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
/* REVIEW ONLY. Independent read-only native camera subscription.
 * NO scene, SOME/IP, sender, network, routes, audio, coding or OEM receiver use.
 * Raw/unverified direction: the trusted broker MUST independently gate front
 * state/provenance and authenticate transport. A decode keyframe is not front.
 * Experimental lifetime <=60s/64MiB. stdin C credits required at least every1s;
 * X/EOF/SIGTERM stops this process and destroys only its unique own receiver.
 */
#define AU_MAX (2U*1024U*1024U)
#define TOTAL_MAX ((1ULL<<44))
struct receiver;
struct packet { size_t size;void *data; };
typedef void (*callback)(struct receiver *,const struct packet *,void *);
typedef struct receiver *(*create_fn)(const char *,const char *);
typedef int (*register_fn)(struct receiver *,callback,void *);
typedef void (*destroy_fn)(struct receiver *);
struct frame { unsigned char *data;size_t used;uint32_t ts,ssrc,packets;uint64_t captured_ns,index; };
struct capture {
 pthread_mutex_t lock;struct frame frames[3],*free[3],*latest,*building;unsigned free_count;
 int started,bad,fu_open,has_sps,has_pps,has_vcl,all_intra;uint16_t expected;
 _Atomic uint64_t received_packets,published,dropped_incomplete,dropped_non_intra,dropped_pending,dropped_lock,last_packet_ns;
};
_Static_assert(ATOMIC_INT_LOCK_FREE==2,"signal stop flag must be lock-free");
static _Atomic int done;
static uint64_t session_end,last_credit;
static int protocol_fd=-1;
static uint64_t now_ns(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return (uint64_t)t.tv_sec*1000000000ULL+t.tv_nsec;}
static void stopped(int s){(void)s;done=1;}
static uint32_t be32(const unsigned char *b){return (uint32_t)b[0]<<24|(uint32_t)b[1]<<16|(uint32_t)b[2]<<8|b[3];}
static void le32(unsigned char *b,uint32_t n){for(unsigned k=0;k<4;k++)b[k]=(unsigned char)(n>>(k*8));}
static void le64(unsigned char *b,uint64_t n){for(unsigned k=0;k<8;k++)b[k]=(unsigned char)(n>>(k*8));}
static void reset(struct capture *c){c->building->used=0;c->building->packets=0;c->started=c->bad=c->fu_open=c->has_sps=c->has_pps=c->has_vcl=0;c->all_intra=1;}
/* First2 unsigned Exp-Golomb values in slice RBSP: first_mb, slice_type.
 * Bound the inspection to64bytes. Never claim an undecodable/unknown slice
 * independent. Current proven ICAM source repeats SPS/PPS and I slices per AU.
 */
static int intra_slice(const unsigned char *b,size_t n){
 unsigned char rbsp[64];size_t used=0;unsigned zeros=0;
 for(size_t i=0;i<n&&used<sizeof rbsp;i++){
  unsigned v=b[i];if(zeros>=2&&v==3){zeros=0;continue;}
  rbsp[used++]=(unsigned char)v;zeros=v==0?zeros+1:0;
 }
 unsigned bit=0,value=0;
 for(unsigned which=0;which<2;which++){
  unsigned z=0;while(bit<used*8&&!(rbsp[bit/8]&(128U>>(bit%8)))){bit++;if(++z>30)return 0;}
  if(bit>=used*8)return 0;bit++;value=1;
  for(unsigned k=0;k<z;k++){if(bit>=used*8)return 0;value=(value<<1)|!!(rbsp[bit/8]&(128U>>(bit%8)));bit++;}
  value--;
 }
 return value%5==2||value%5==4;
}
static void nal(struct capture *c,unsigned type,const unsigned char *body,size_t n){
 if(type==7)c->has_sps=1;
 else if(type==8)c->has_pps=1;
 else if(type==1||type==5){c->has_vcl=1;if(type!=5&&!intra_slice(body,n))c->all_intra=0;}
}
static void received(struct receiver *r,const struct packet *p,void *user){
 (void)r;struct capture *c=user;if(done||!p||!p->data||p->size<13||p->size>65535)return;
 const unsigned char *b=p->data;size_t n=p->size,pos=12+4*(b[0]&15),end=n;
 if(b[0]>>6!=2||pos>n)return;
 if(b[0]&16){if(pos+4>n)return;pos+=4+4*((size_t)b[pos+2]*256+b[pos+3]);}
 if(pos>=n)return;
 if(b[0]&32){if(!b[n-1]||b[n-1]>n-pos)return;end-=b[n-1];}
 if(pos>=end)return;
 uint32_t ts=be32(b+4),ssrc=be32(b+8);uint16_t seq=(uint16_t)((unsigned)b[2]*256+b[3]);
 atomic_fetch_add(&c->received_packets,1);atomic_store(&c->last_packet_ns,now_ns());
 if(c->started&&(c->building->ts!=ts||c->building->ssrc!=ssrc)){
  atomic_fetch_add(&c->dropped_incomplete,1);reset(c);
 }
 if(!c->started){c->started=1;c->expected=seq;c->building->ts=ts;c->building->ssrc=ssrc;}
 if(seq!=c->expected){c->bad=1;c->fu_open=0;}c->expected=(uint16_t)(seq+1);
 if(c->building->packets>=4096||n+4>AU_MAX-c->building->used)c->bad=1;
 if(!c->bad){le32(c->building->data+c->building->used,(uint32_t)n);c->building->used+=4;memcpy(c->building->data+c->building->used,b,n);c->building->used+=n;c->building->packets++;}
 unsigned type=b[pos]&31;
 if(type>=1&&type<=23){if(c->fu_open)c->bad=1;c->fu_open=0;nal(c,type,b+pos+1,end-pos-1);}
 else if(type==24){
  size_t at=pos+1;while(at+2<=end){size_t len=(size_t)b[at]*256+b[at+1];at+=2;if(!len||len>end-at){c->bad=1;break;}nal(c,b[at]&31,b+at+1,len-1);at+=len;}
  if(at!=end)c->bad=1;
 }else if(type==28&&end-pos>=3){
  unsigned flags=b[pos+1];
  if(flags&128){if(c->fu_open||(flags&64))c->bad=1;c->fu_open=1;nal(c,flags&31,b+pos+2,end-pos-2);}
  else if(!c->fu_open)c->bad=1;
  if(flags&64)c->fu_open=0;
 }else c->bad=1;
 if(!(b[1]&128))return;
 if(c->bad||c->fu_open){atomic_fetch_add(&c->dropped_incomplete,1);reset(c);return;}
 if(!c->has_sps||!c->has_pps||!c->has_vcl||!c->all_intra){atomic_fetch_add(&c->dropped_non_intra,1);reset(c);return;}
 /* O(1) swap only: callback never waits on stdout or a consumer-held mutex. */
 if(pthread_mutex_trylock(&c->lock)){atomic_fetch_add(&c->dropped_lock,1);reset(c);return;}
 struct frame *next=c->latest;
 if(next)atomic_fetch_add(&c->dropped_pending,1);
 else if(c->free_count)next=c->free[--c->free_count];
 else{pthread_mutex_unlock(&c->lock);atomic_fetch_add(&c->dropped_lock,1);reset(c);return;}
 c->building->captured_ns=now_ns();c->building->index=atomic_fetch_add(&c->published,1)+1;
 c->latest=c->building;c->building=next;pthread_mutex_unlock(&c->lock);reset(c);
}
static int control(void){
 char bytes[64];ssize_t n;
 while((n=read(STDIN_FILENO,bytes,sizeof bytes))>0)for(ssize_t j=0;j<n;j++){
  if(bytes[j]=='C')last_credit=now_ns();else{done=1;return 0;}
 }
 if(n==0){done=1;return 0;}
 if(n<0&&errno!=EAGAIN&&errno!=EWOULDBLOCK&&errno!=EINTR){done=1;return 0;}
 uint64_t now=now_ns();if(now>=session_end||now-last_credit>1000000000ULL){done=1;return 0;}
 return !done;
}
static int output(const unsigned char *b,size_t size,uint64_t expires){
 size_t used=0;
 while(used<size&&control()){
  if(now_ns()>=expires)return 0;
  ssize_t n=write(protocol_fd,b+used,size-used);
  if(n>0){used+=(size_t)n;continue;}
  if(n<0&&errno!=EAGAIN&&errno!=EWOULDBLOCK&&errno!=EINTR)return 0;
  struct pollfd fds[2]={{protocol_fd,POLLOUT,0},{STDIN_FILENO,POLLIN,0}};poll(fds,2,20);
 }
 return used==size;
}
int main(int argc,char **argv){
 if(argc!=3||strcmp(argv[1],"--seconds")){fprintf(stderr,"usage: continuous-avb-observer --seconds 1..60; stdin C credits, X/EOF stop\n");return 2;}
 char *end=NULL;long seconds=strtol(argv[2],&end,10);if(!end||*end||seconds<1||seconds>86400)return 2;
 signal(SIGINT,stopped);signal(SIGTERM,stopped);signal(SIGPIPE,SIG_IGN);
 session_end=now_ns()+(uint64_t)seconds*1000000000ULL;last_credit=now_ns();
 protocol_fd=dup(STDOUT_FILENO);if(protocol_fd<0||dup2(STDERR_FILENO,STDOUT_FILENO)<0)return 2;
 int in_flags=fcntl(STDIN_FILENO,F_GETFL),out_flags=fcntl(protocol_fd,F_GETFL);
 if(in_flags<0||out_flags<0||fcntl(STDIN_FILENO,F_SETFL,in_flags|O_NONBLOCK)||fcntl(protocol_fd,F_SETFL,out_flags|O_NONBLOCK))return 2;
 struct pollfd ready={STDIN_FILENO,POLLIN,0};
 if(poll(&ready,1,500)<=0||!control()){fprintf(stderr,"no visibility credit\n");return 3;}
 struct capture c={0};pthread_mutex_init(&c.lock,NULL);
 for(unsigned k=0;k<3;k++){c.frames[k].data=malloc(AU_MAX);if(!c.frames[k].data){for(unsigned j=0;j<k;j++)free(c.frames[j].data);return 2;}}
 c.building=&c.frames[0];c.free[c.free_count++]=&c.frames[1];c.free[c.free_count++]=&c.frames[2];reset(&c);
 void *lib=dlopen("libias-media_transport-avb_ufipc_bridge.so.1",RTLD_NOW|RTLD_LOCAL);
 if(!lib){fprintf(stderr,"bridge dlopen: %s\n",dlerror());return 2;}
 create_fn create=(create_fn)dlsym(lib,"ias_avbbridge_create_receiver");register_fn reg=(register_fn)dlsym(lib,"ias_avbbridge_register_H264_cb");destroy_fn destroy=(destroy_fn)dlsym(lib,"ias_avbbridge_destroy_receiver");
 if(!create||!reg||!destroy){fprintf(stderr,"verified bridge ABI absent\n");return 2;}
 char own[100];snprintf(own,sizeof own,"owner.camera.live.%ld.%llu",(long)getpid(),(unsigned long long)(now_ns()%1000000000ULL));
 struct receiver *receiver=create(own,"media_transport.avb_streaming.1");int failed=0;uint64_t sent=0,bytes=0,dropped_stale=0,started=now_ns();
 if(!receiver){failed=1;goto cleanup;}
 if(reg(receiver,received,&c)){failed=1;goto cleanup;}
 if(!output((const unsigned char *)"RSEAU2\0\0",8,now_ns()+250000000ULL)){failed=!done;goto cleanup;}
 while(control()){
  (void)atomic_load(&c.last_packet_ns);
  /* Resident bridge may wait for an OEM source transition. Credits still expire. */
  /* Resident bridge may wait for an OEM source transition. Credits still expire. */
  pthread_mutex_lock(&c.lock);struct frame *frame=c.latest;c.latest=NULL;pthread_mutex_unlock(&c.lock);
  if(!frame){struct pollfd fd={STDIN_FILENO,POLLIN,0};poll(&fd,1,5);continue;}
  if(now_ns()-frame->captured_ns>250000000ULL)dropped_stale++;
  else{
   unsigned char header[32];le32(header,(uint32_t)frame->used);le32(header+4,frame->packets);le32(header+8,frame->ts);
   le32(header+12,1); /* independent decode AU ONLY; NOT a front provenance flag */
   le64(header+16,frame->captured_ns);le64(header+24,frame->index);
   if(bytes+sizeof header+frame->used>TOTAL_MAX){done=1;}
   else if(!output(header,sizeof header,frame->captured_ns+250000000ULL)||!output(frame->data,frame->used,frame->captured_ns+250000000ULL)){failed=!done;done=1;}
   else{sent++;bytes+=sizeof header+frame->used;}
  }
  pthread_mutex_lock(&c.lock);c.free[c.free_count++]=frame;pthread_mutex_unlock(&c.lock);
 }
cleanup:
 done=1;if(receiver)destroy(receiver); /* joins our callback and removes our stub */
 fprintf(stderr,"{\"kind\":\"raw_unverified_direction\",\"own_receiver_removed\":true,\"sent_aus\":%llu,\"bytes\":%llu,\"packets\":%llu,\"published\":%llu,\"drop_pending\":%llu,\"drop_bad_au\":%llu,\"drop_non_independent\":%llu,\"drop_lock\":%llu,\"drop_stale\":%llu,\"elapsed_ms\":%llu,\"failed\":%d}\n",(unsigned long long)sent,(unsigned long long)bytes,(unsigned long long)atomic_load(&c.received_packets),(unsigned long long)atomic_load(&c.published),(unsigned long long)atomic_load(&c.dropped_pending),(unsigned long long)atomic_load(&c.dropped_incomplete),(unsigned long long)atomic_load(&c.dropped_non_intra),(unsigned long long)atomic_load(&c.dropped_lock),(unsigned long long)dropped_stale,(unsigned long long)((now_ns()-started)/1000000ULL),failed);
 for(unsigned k=0;k<3;k++)free(c.frames[k].data);pthread_mutex_destroy(&c.lock);
 fcntl(STDIN_FILENO,F_SETFL,in_flags);fcntl(protocol_fd,F_SETFL,out_flags);
 return failed?4:0;
}
