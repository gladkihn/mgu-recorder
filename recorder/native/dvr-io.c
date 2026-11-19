#define _GNU_SOURCE
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/resource.h>
#include <sys/file.h>
#include <sys/prctl.h>
#include <signal.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdatomic.h>
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>
static int allocate(const char *p,long long bytes){int fd=open(p,O_RDWR|O_CREAT|O_NOFOLLOW,0600);if(fd<0)return 1;struct stat s;if(fstat(fd,&s)||!S_ISREG(s.st_mode)||s.st_nlink!=1||(s.st_size&&s.st_size!=bytes)){close(fd);return 1;}int e=posix_fallocate(fd,0,bytes);if(e){fprintf(stderr,"allocation: %s\n",strerror(e));close(fd);return 1;}int r=fsync(fd);close(fd);char *parent=strdup(p);if(!parent)return 1;char *slash=strrchr(parent,'/');if(!slash){free(parent);return 1;}*slash=0;fd=open(parent,O_RDONLY|O_DIRECTORY|O_NOFOLLOW);free(parent);if(fd<0)return 1;if(fsync(fd))r=1;close(fd);return !!r;}
static int frames(const char *p,int w,int h){if(strcmp(p,"/dev/shm/mgu-video-owner-dvr")||w<16||h<16||w>2048||h>2048||(w&1)||(h&1))return 2;size_t size=(size_t)w*h*3/2,total=64+size*3;int fd=open(p,O_RDWR|O_CREAT|O_NOFOLLOW,0644);if(fd<0)return 1;struct stat st;if(fstat(fd,&st)||!S_ISREG(st.st_mode)||st.st_nlink!=1||st.st_uid!=geteuid()){close(fd);return 1;}if(ftruncate(fd,total)||fchmod(fd,0644)){close(fd);return 1;}unsigned char *m=mmap(NULL,total,PROT_READ|PROT_WRITE,MAP_SHARED,fd,0);if(m==MAP_FAILED)return 1;uint32_t *head=(uint32_t *)m;memset(m,0,64);head[0]=0x4656474d;head[1]=1;head[2]=w;head[3]=h;head[6]=3;head[7]=1;uint32_t seq=0,slot=0;
 for(;;){unsigned next=(slot+1)%3;size_t at=0;while(at<size){ssize_t n=read(0,m+64+next*size+at,size-at);if(n==0)goto done;if(n<0){if(errno==EINTR)continue;goto done;}at+=n;}slot=next;atomic_store_explicit((_Atomic uint32_t *)&head[5],slot,memory_order_release);atomic_store_explicit((_Atomic uint32_t *)&head[4],++seq,memory_order_release);printf("FRAME %u\n",seq);fflush(stdout);}
done:munmap(m,total);close(fd);return 0;}
int main(int argc,char **argv){if(prctl(PR_SET_PDEATHSIG,SIGKILL)||getppid()==1)return 1;if(argc==4&&!strcmp(argv[1],"allocate")){char *end;long long bytes=strtoll(argv[3],&end,10);if(*end||bytes<4096||bytes>17179869184LL)return 2;return allocate(argv[2],bytes);}if(argc==5&&!strcmp(argv[1],"frames"))return frames(argv[2],atoi(argv[3]),atoi(argv[4]));if(argc>3&&!strcmp(argv[1],"low-priority")&&!strcmp(argv[2],"--")){setpriority(PRIO_PROCESS,0,15);execv(argv[3],argv+3);perror("exec");return 1;}if(argc>4&&!strcmp(argv[1],"lockrun")){int fd=open(argv[2],O_CREAT|O_RDWR|O_NOFOLLOW,0600);struct stat s;if(fd<0||fstat(fd,&s)||!S_ISREG(s.st_mode)||s.st_nlink!=1||s.st_uid!=geteuid()||flock(fd,LOCK_EX|LOCK_NB)){fputs("recorder lock unavailable\n",stderr);return 1;}execv(argv[3],argv+3);return 1;}fputs("usage: dvr-io allocate FILE BYTES | frames PATH W H | low-priority -- EXEC ARGS... | lockrun FILE EXEC ARGS...\n",stderr);return 2;}
