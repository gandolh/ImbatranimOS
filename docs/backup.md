# Data, backup and a lost password

## Where your data lives

Everything that makes the machine yours lives under `/home/imbatranim` inside a named Docker volume, not in the container's writable layer: your password hash, your notes, your files, installed marketplace apps and the SQLite database (`~/.imbatranim/db.sqlite`). Delete and recreate the container as often as you like; the volume is what persists.

The volume's name depends on how you started the container:

| Started with | Volume |
|---|---|
| `docker compose -f infrastructure/docker-compose.yml up imbatranimos` | `infrastructure_imbatranim-home` |
| `docker run ... -v imbatranim-home:/home/imbatranim ...` | `imbatranim-home` |

`docker volume ls` shows which one you have. The commands below use the Compose name; swap in yours.

## Back up from inside the OS

Use **Settings → Backup**. It works everywhere, including the server ISO and a hosted instance, where there is no host shell to run Docker from.

- **Download backup** streams the home folder as `imbatranim-home-YYYY-MM-DD.tar.gz`. The database goes in as a consistent `VACUUM INTO` snapshot rather than a hot copy. The Trash, installed marketplace apps and the Browser's encryption key stay behind; after a restore, the Marketplace pane offers to reinstall the apps.
- **Choose a backup file…** reads an archive, shows its date and which folders it would replace, and applies it only after you type `RESTORE`.

A restore signs you out, because the backup brings its own password with it. Sign in with the password the backup was taken with.

## Back up from the host

If you have a shell on the Docker host, stop the container first: this copies `db.sqlite` as a file, and copying it while the server writes to it can give you a broken database.

```bash
docker run --rm -v infrastructure_imbatranim-home:/home/imbatranim -v "$(pwd)":/backup \
  alpine tar czf /backup/imbatranim-home-backup.tar.gz -C / home/imbatranim
```

Restore it into a fresh volume the same way in reverse: `tar xzf` instead of `czf`, extracting into the mounted volume.

## A lost password

There is no "forgot password" flow. Setup runs once and refuses to run again while an owner exists, so nobody can reset the password silently. If you're locked out, back up the volume first, stop the container, and clear the owner from the database. Everything else stays:

```bash
docker run --rm -v infrastructure_imbatranim-home:/home/imbatranim alpine sh -c \
  "apk add -q sqlite && sqlite3 /home/imbatranim/.imbatranim/db.sqlite \
   'DELETE FROM local_owner; DELETE FROM local_session;'"
```

Start it again and **Set up this machine** runs once more.
