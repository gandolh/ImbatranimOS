// Compatibility shim: the registry is now built in src/manifest.ts (the
// composition root that imports the add-on packages); the AppConfig type
// lives in the add-on contract. Shell code keeps importing from here.
export { APP_REGISTRY } from '../../manifest'
export type { AppConfig } from '../../contract'
