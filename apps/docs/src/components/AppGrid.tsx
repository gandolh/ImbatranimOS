/**
 * A showcase grid of desktop apps, grouped by category. Light-themed, no deps.
 * Usage in an .mdx page:
 *   import AppGrid from '@site/src/components/AppGrid'
 *   <AppGrid groups={[{ name: 'System', tag: 'real', apps: [
 *     { name: 'Terminal', note: 'a real PTY over an authed WS' }, ... ] }]} />
 *
 * Light-only: literal colours, so the grid cannot invert.
 */
import styles from './AppGrid.module.css'

interface App {
  name: string
  note: string
}

interface Group {
  name: string
  tag?: string
  apps: App[]
}

export default function AppGrid({ groups }: { groups: Group[] }) {
  return (
    <div className={styles.appgrid}>
      {groups.map((g) => (
        <section className={styles.grp} key={g.name}>
          <header>
            <h3>{g.name}</h3>
            {g.tag && <span className={styles.tag}>{g.tag}</span>}
          </header>
          <div className={styles.apps}>
            {g.apps.map((a) => (
              <div className={styles.app} key={a.name}>
                <strong>{a.name}</strong>
                <span>{a.note}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
