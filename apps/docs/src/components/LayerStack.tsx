/**
 * The ImbatranimOS three-layer diagram, as light-themed HTML/CSS (no deps).
 * Server (kernel) at the base, the client layers stacked above, the seam
 * between apps and the compositor called out.
 *
 * Light-only: literal colours, so the diagram cannot invert.
 */
import clsx from 'clsx'
import styles from './LayerStack.module.css'

export default function LayerStack() {
  return (
    <div className={styles.stack}>
      <div className={styles.lane}>
        <span className={styles.side}>
          browser tab
          <br />
          <em>pixels · input</em>
        </span>
        <div className={clsx(styles.layer, styles.client)}>
          <span className={styles.tag}>Layer 2 · client</span>
          <strong>Compositor + Display</strong>
          <p>window manager · z-order · focus · input routing · taskbar</p>
        </div>
      </div>

      <div className={styles.seam}>
        <span>
          ▲ <code>system</code> handle — the seam (brief 48)
        </span>
      </div>

      <div className={styles.lane}>
        <span className={styles.side}>
          first-party
          <br />
          <em>23 apps</em>
        </span>
        <div className={clsx(styles.layer, styles.client)}>
          <span className={styles.tag}>Layer 3 · client + routes</span>
          <strong>Apps</strong>
          <p>import nothing from core · receive a capability handle at mount</p>
        </div>
      </div>

      <div className={clsx(styles.seam, styles.data)}>
        <span>
          ▼ HTTP / WS — <em>data, never pixels</em>
        </span>
      </div>

      <div className={styles.lane}>
        <span className={styles.side}>
          the machine
          <br />
          <em>Alpine Linux</em>
        </span>
        <div className={clsx(styles.layer, styles.server)}>
          <span className={styles.tag}>Layer 1 · server</span>
          <strong>Kernel + Userland</strong>
          <p>NestJS = the syscall bridge · FS · PTY · /proc · git · http-proxy</p>
        </div>
      </div>
    </div>
  )
}
