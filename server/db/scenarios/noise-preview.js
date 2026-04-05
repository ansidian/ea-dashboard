// Adds noise emails with `id` field so inline preview can fetch bodies.
// Tests: Group C (Enhancement 5)

export default function noisePreview(briefing) {
  const accounts = briefing.emails?.accounts;
  if (!accounts?.length) return;

  for (const acct of accounts) {
    acct.noise = [
      { id: "mock-noise-001", from: "Costco Wholesale", subject: "Members Only: Save up to $500 on select electronics" },
      { id: "mock-noise-002", from: "LinkedIn", subject: "Andy, you have 3 new connection requests" },
      { id: "mock-noise-003", from: "DoorDash", subject: "Your $5 credit expires soon — order now!" },
    ];
    acct.noise_count = acct.noise.length;
  }
}

noisePreview.description = "Adds noise emails with IDs for inline body preview testing";
noisePreview.category = "Email";
