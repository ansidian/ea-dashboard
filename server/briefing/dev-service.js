import { indexEmails } from "./email-index.js";
import { loadUserConfig, fetchAllEmails } from "./index.js";

export async function reindexEmails(userId, hoursBack) {
  const { accounts, settings } = await loadUserConfig(userId);
  const emails = await fetchAllEmails(accounts, settings, hoursBack);
  await indexEmails(userId, emails);
  return { indexed: emails.length, hoursBack };
}
