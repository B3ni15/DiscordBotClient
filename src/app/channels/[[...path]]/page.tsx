// Same app as "/"; this route only exists so a direct load or reload of a
// `/channels/@me`, `/channels/<guildId>` or `/channels/<guildId>/<channelId>`
// link (written by `useUrlSync`) lands on the app instead of a 404.
export { default } from "@/app/page";
