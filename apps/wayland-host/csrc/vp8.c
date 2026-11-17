/* A VP8 encoder over libvpx for a window's video region (src/video.rs).
 * Written in C against libvpx's own headers, so the Rust side never depends
 * on the layout of libvpx's structs, which changes between its versions. */
#include <stdint.h>
#include <stdlib.h>
#include <vpx/vp8cx.h>
#include <vpx/vpx_encoder.h>

typedef struct {
  vpx_codec_ctx_t ctx;
  vpx_codec_enc_cfg_t cfg;
  vpx_image_t img;
  int width, height;
} imbatranim_vp8;

typedef void (*imbatranim_vp8_sink)(void *user, const uint8_t *data, size_t len);

/* Real time, one thread, constant bitrate, no frame ever dropped (the tab
 * needs every one) and no keyframe unless asked for: the link is reliable,
 * so a keyframe is needed only when the stream starts. Timestamps are in
 * milliseconds, so the bitrate holds whatever the frame rate. */
imbatranim_vp8 *imbatranim_vp8_new(int width, int height, int kbps) {
  imbatranim_vp8 *e = calloc(1, sizeof(imbatranim_vp8));
  if (!e) return NULL;
  if (vpx_codec_enc_config_default(vpx_codec_vp8_cx(), &e->cfg, 0)) {
    free(e);
    return NULL;
  }
  e->cfg.g_w = width;
  e->cfg.g_h = height;
  e->cfg.g_timebase.num = 1;
  e->cfg.g_timebase.den = 1000;
  e->cfg.g_threads = 1;
  e->cfg.g_lag_in_frames = 0;
  e->cfg.g_pass = VPX_RC_ONE_PASS;
  e->cfg.rc_end_usage = VPX_CBR;
  e->cfg.rc_target_bitrate = kbps;
  e->cfg.rc_min_quantizer = 2;
  e->cfg.rc_max_quantizer = 56;
  e->cfg.rc_undershoot_pct = 100;
  e->cfg.rc_overshoot_pct = 15;
  e->cfg.rc_buf_initial_sz = 500;
  e->cfg.rc_buf_optimal_sz = 600;
  e->cfg.rc_buf_sz = 1000;
  e->cfg.rc_dropframe_thresh = 0;
  e->cfg.kf_mode = VPX_KF_DISABLED;
  if (vpx_codec_enc_init(&e->ctx, vpx_codec_vp8_cx(), &e->cfg, 0)) {
    free(e);
    return NULL;
  }
  /* The fastest real-time speed: measured as fast as JPEG with fewer bytes
   * (corpus/wiki/research-video-in-linux-windows.md). */
  vpx_codec_control(&e->ctx, VP8E_SET_CPUUSED, -16);
  vpx_codec_control(&e->ctx, VP8E_SET_NOISE_SENSITIVITY, 0);
  vpx_codec_control(&e->ctx, VP8E_SET_STATIC_THRESHOLD, 1);
  vpx_codec_control(&e->ctx, VP8E_SET_TOKEN_PARTITIONS, 0);
  vpx_codec_control(&e->ctx, VP8E_SET_MAX_INTRA_BITRATE_PCT, 300);
  vpx_img_wrap(&e->img, VPX_IMG_FMT_I420, width, height, 1, NULL);
  e->width = width;
  e->height = height;
  return e;
}

int imbatranim_vp8_set_bitrate(imbatranim_vp8 *e, int kbps) {
  e->cfg.rc_target_bitrate = kbps;
  return vpx_codec_enc_config_set(&e->ctx, &e->cfg) ? -1 : 0;
}

/* `i420`: the Y plane (width × height), then U and V (each a quarter of it);
 * the width and height are even. Every packet of the frame goes to `sink`. */
int imbatranim_vp8_encode(imbatranim_vp8 *e, uint8_t *i420, int64_t pts_ms, unsigned long duration_ms, int keyframe,
                          imbatranim_vp8_sink sink, void *user) {
  size_t luma = (size_t)e->width * e->height;
  e->img.planes[VPX_PLANE_Y] = i420;
  e->img.planes[VPX_PLANE_U] = i420 + luma;
  e->img.planes[VPX_PLANE_V] = i420 + luma + luma / 4;
  e->img.stride[VPX_PLANE_Y] = e->width;
  e->img.stride[VPX_PLANE_U] = e->width / 2;
  e->img.stride[VPX_PLANE_V] = e->width / 2;
  if (vpx_codec_encode(&e->ctx, &e->img, pts_ms, duration_ms, keyframe ? VPX_EFLAG_FORCE_KF : 0, VPX_DL_REALTIME))
    return -1;
  vpx_codec_iter_t iter = NULL;
  const vpx_codec_cx_pkt_t *pkt;
  while ((pkt = vpx_codec_get_cx_data(&e->ctx, &iter)))
    if (pkt->kind == VPX_CODEC_CX_FRAME_PKT) sink(user, pkt->data.frame.buf, pkt->data.frame.sz);
  return 0;
}

void imbatranim_vp8_free(imbatranim_vp8 *e) {
  if (!e) return;
  vpx_codec_destroy(&e->ctx);
  free(e);
}
