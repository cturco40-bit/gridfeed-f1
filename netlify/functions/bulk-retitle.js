import { sb, logSync, json } from './lib/shared.js';

// One-shot title rewrite for the initial batch of pipeline-generated
// articles. Uses service role (sb helper) so RLS doesn't block updates.
// Delete this file after running once.

const UPDATES = [
  { id: '243e5fa1-3b20-4671-9cde-1479ee640918', title: "Antonelli's 9-Point Lead Is Real. The Margin of Error Behind It Is Not." },
  { id: 'bdcc4f14-944c-49d6-bebd-a31ab6ddb422', title: "Bahrain and Saudi Arabia Weren't Cancelled. They Were Priced Out." },
  { id: '0ec22749-97b9-4029-bfc1-d8eb57245fd5', title: "Three Races, Three Fifths: Norris Is Trapped in McLaren's Ceiling" },
  { id: '379ac136-8433-4550-81a9-305bf7ee32dd', title: "Russell's Problem Isn't the Car. It's the Driver on the Other Side of the Garage." },
  { id: '1418bcd5-8b84-403a-b787-ebb555308839', title: "Verstappen's Problem Isn't the Engine. It's a Chassis Red Bull Can't Fix." },
  { id: '2bae5b71-60a6-4e55-a008-cd70c03ea99f', title: "ADUO Explained: F1's Engine Catch-Up System Won't Deliver Quick Fixes" },
  { id: '9227247b-2df7-4f50-a14c-4de054d3a33c', title: "Red Bull's Exodus: How Three Key Departures Broke the Machine That Won Four Titles" },
  { id: '52deaefd-179a-4c26-ac30-a6dfa464636a', title: "Norris Names the Four People Who Made Him World Champion" },
  { id: 'cca13213-b917-40fe-a307-ff5eeb5f835e', title: "Oliver Bearman Has More Points Than Max Verstappen. That Is Not a Typo." },
  { id: 'a1a1b6dc-2724-4cd8-81fd-67a8b2c1f64f', title: "Aston Martin's Problem Is the Chassis, Not the Honda. The Data Proves It." },
  { id: '92185685-8fbc-444a-909d-860129d326b2', title: "Fernando Alonso Has Not Won in 13 Years. He Is Still the Best Pure Driver on the Grid." },
  { id: '8949b940-a40c-4cd4-8e0a-e9ecf1ee682d', title: "Stroll Goes GT Racing While F1 Takes a Break. The Reason Why Says Everything." },
  { id: '42c87524-09f7-4890-83ca-4c184fa1d050', title: "Leclerc Has 49 Points and Zero Wins. Ferrari's 2026 Problem Is Pace, Not Consistency." },
];

export default async (req) => {
  const start = Date.now();
  const results = [];
  try {
    for (const u of UPDATES) {
      const ok = await sb(`articles?id=eq.${u.id}`, 'PATCH', { title: u.title });
      results.push({ id: u.id, title: u.title, ok });
    }
    await logSync('bulk-retitle', 'success', results.filter(r => r.ok).length, `Renamed ${results.filter(r => r.ok).length}/${results.length}`, Date.now() - start);
    return json({ ok: true, updated: results.filter(r => r.ok).length, total: results.length, results });
  } catch (err) {
    await logSync('bulk-retitle', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message, results }, 500);
  }
};
