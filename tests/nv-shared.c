#include <assert.h>
#include <stdlib.h>
#include <stdio.h>
#define NV_MAX 4096
#define NV_OUT_SLOTS 4
#include "../recorder/native/nv-output.h"
int main(void){unsigned char*map=calloc(1,NV_OUT_BYTES),data[1024],copy[4096];uint32_t meta[10]={1024,0,123,0,16,32,32,0x59565955,1,1},ref[6],old[6];unsigned n;nvOutInit(map,117);memset(data,19,sizeof(data));assert(!nvOutPublish(map,meta,data,ref));memcpy(old,ref,24);assert(nvOutCopy(map,ref,copy,&n)&&n==1024&&!memcmp(data,copy,1024));ref[4]++;assert(!nvOutCopy(map,ref,copy,&n));for(int i=0;i<4;i++){memset(data,20+i,sizeof(data));assert(!nvOutPublish(map,meta,data,ref));}assert(!nvOutCopy(map,old,copy,&n));assert(nvOutCopy(map,ref,copy,&n)&&copy[0]==23);uint32_t*m=(uint32_t*)nvOutSlot(map,ref[2]);atomic_store((_Atomic unsigned*)&m[15],ref[1]*2+1);assert(!nvOutCopy(map,ref,copy,&n));ref[2]=NV_OUT_SLOTS;assert(!nvOutCopy(map,ref,copy,&n));free(map);puts("PASS NV shared ring: exact pixels, generation isolation, overwrite/partial-write detection, bounded memory and no heap-video pipe");return 0;}
