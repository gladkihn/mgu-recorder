#ifndef OWNER_NV_OUTPUT_H
#define OWNER_NV_OUTPUT_H
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdatomic.h>
#ifndef NV_MAX
#define NV_MAX (2*1024*1024)
#endif
#ifndef NV_OUT_SLOTS
#define NV_OUT_SLOTS 128
#endif
#define NV_OUT_PATH "/dev/shm/owner-dvr-nv-woven"
#define NV_OUT_MAGIC 0x3157564eU
#define NV_REF_MAGIC 0x3152564eU
#define NV_OUT_BYTES (64+(size_t)NV_OUT_SLOTS*(64+NV_MAX))
static void nvOutInit(unsigned char*map,uint32_t epoch){memset(map,0,64);uint32_t*h=(uint32_t*)map;h[0]=NV_OUT_MAGIC;h[1]=1;h[4]=NV_OUT_SLOTS;h[5]=epoch?epoch:1;}
static unsigned char*nvOutSlot(unsigned char*map,unsigned slot){return map+64+(size_t)slot*(64+NV_MAX);}
static int nvOutPublish(unsigned char*map,const uint32_t*meta,const unsigned char*data,uint32_t*ref){if(!meta[0]||meta[0]>NV_MAX)return -1;uint32_t*h=(uint32_t*)map;unsigned seq=atomic_load_explicit((_Atomic unsigned*)&h[2],memory_order_acquire)+1;if(!seq)seq=1;unsigned slot=seq%NV_OUT_SLOTS;uint32_t*m=(uint32_t*)nvOutSlot(map,slot);atomic_store_explicit((_Atomic unsigned*)&m[15],seq*2-1,memory_order_seq_cst);memcpy(m,meta,40);m[1]=seq;m[11]=h[5];memcpy((unsigned char*)m+64,data,meta[0]);atomic_store_explicit((_Atomic unsigned*)&m[15],seq*2,memory_order_release);atomic_store_explicit((_Atomic unsigned*)&h[3],slot,memory_order_release);atomic_store_explicit((_Atomic unsigned*)&h[2],seq,memory_order_release);ref[0]=NV_REF_MAGIC;ref[1]=seq;ref[2]=slot;ref[3]=meta[0];ref[4]=h[5];ref[5]=NV_OUT_SLOTS;return 0;}
static int nvOutCopy(unsigned char*map,const uint32_t*ref,unsigned char*copy,unsigned*length){uint32_t*h=(uint32_t*)map;if(ref[0]!=NV_REF_MAGIC||ref[2]>=NV_OUT_SLOTS||ref[3]>NV_MAX||!ref[3]||ref[5]!=NV_OUT_SLOTS||h[0]!=NV_OUT_MAGIC||h[1]!=1||h[4]!=NV_OUT_SLOTS||h[5]!=ref[4])return 0;uint32_t*m=(uint32_t*)nvOutSlot(map,ref[2]);unsigned before=atomic_load_explicit((_Atomic unsigned*)&m[15],memory_order_acquire);if(before!=ref[1]*2||m[1]!=ref[1]||m[0]!=ref[3]||m[11]!=ref[4])return 0;memcpy(copy,(unsigned char*)m+64,ref[3]);atomic_thread_fence(memory_order_acquire);if(atomic_load_explicit((_Atomic unsigned*)&m[15],memory_order_acquire)!=before)return 0;*length=ref[3];return 1;}
#endif
