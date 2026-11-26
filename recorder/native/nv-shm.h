#ifndef OWNER_NV_SHM_H
#define OWNER_NV_SHM_H
#include <stdint.h>
#include <stdatomic.h>
#define NV_MAX (2*1024*1024)
#define NV_SLOTS 16
#define NV_SHM_BYTES (64+NV_SLOTS*(64+NV_MAX))
#define NV_SHM_PATH "/dev/shm/owner-dvr-nv-frame"
#define NV_MAGIC 0x3154564eU
#endif
