import { sb, logSync, json } from './lib/shared.js';

// One-shot: rewrite all 14 articles with new titles, bodies, excerpts, tags.
// Delete after successful run.

function firstTwoSentences(text) {
  const sentences = (text || '').trim().split(/(?<=[.!?])\s+/);
  return sentences.slice(0, 2).join(' ').slice(0, 300);
}

function makeSlug(title) {
  return (title || '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

const ARTICLES = [
  {
    id: '243e5fa1-3b20-4671-9cde-1479ee640918',
    title: "Antonelli's 9-Point Lead Is Real. The Margin of Error Behind It Is Not.",
    tags: ["ANALYSIS","MERCEDES","CHAMPIONSHIP"],
    body: `Kimi Antonelli leads George Russell 72-63 after three races, with his second consecutive victory at Suzuka sparking a safety car controversy that Mercedes' own data dismantles.

The timing looked convenient. Antonelli pitted under the safety car at Suzuka, rejoined in clean air, and converted a strategic gamble into a 9-point championship lead. Russell, still stuck behind Oscar Piastri when the caution flew, had no answer.

Mercedes maintains the safety car changed nothing. Their argument is specific: Antonelli was lapping faster than both Piastri and Russell on medium tyres before the caution. Charles Leclerc had already pitted his Ferrari, giving Antonelli clear track. The original plan was to over-cut both rivals through sheer pace, then pit late. The safety car accelerated the outcome. It did not create it.

BBC Sport's post-race analysis supports that reading. One lap separated Russell's pit stop from the caution deployment. Antonelli's tyre degradation was manageable. The over-cut was working. Whether the final margin would have been 2 seconds or 12 seconds is unknowable, but the result was heading in the same direction.

Two wins from three races is not luck. Antonelli has now outscored Russell at every circuit except Melbourne, where Russell took pole-to-flag. Leclerc sits third on 49 points with two podiums from three races. The top three are separated by genuine pace differences, not safety car roulette.

Miami on May 1 offers Russell his best chance to reset. He knows the circuit, and sprint weekends reward qualifying pace. But Antonelli has won in every condition so far. The 9-point gap is small. The momentum behind it is not.`,
  },
  {
    id: 'bdcc4f14-944c-49d6-bebd-a31ab6ddb422',
    title: "Bahrain and Saudi Arabia Weren't Cancelled. They Were Priced Out.",
    tags: ["ANALYSIS","CHAMPIONSHIP"],
    body: `The cancellation of Bahrain and Saudi Arabia from the 2026 calendar was not a surprise. It was a confession. F1 sold itself into the Middle East on the promise of stability — massive hosting fees, state infrastructure, guaranteed calendar slots. Bahrain since 2004. Saudi Arabia since 2021. Both paid handsomely. Both are now gone in a single decision.

The financial model behind F1's calendar expansion depends on political goodwill the sport cannot control. When that goodwill evaporates — through regional conflict, diplomatic shifts, or public pressure — the calendar contracts and nobody compensates for the lost revenue. Broadcasters still buy the season. Sponsors still activate globally. But two fewer hosting fees is two fewer hosting fees.

For the championship, the compression matters. Twenty races instead of 22 means fewer total points available, tighter margins, and less room for recovery after a bad weekend. Kimi Antonelli leads George Russell 72-63 after three rounds. That 9-point gap looks manageable across 17 remaining races. Across 19, Russell had more runway. The cancellations shrank his margin for error.

Teams feel it differently. Every squad built their 2026 budget around a 22-race calendar. Two fewer flyaways — both expensive Gulf rounds requiring intercontinental freight — reduce logistics costs under the cap. That recovered spending goes directly into car development during a regulation cycle that rewards exactly that investment. Mercedes, already leading the constructors by 45 points over Ferrari, are best positioned to convert savings into on-track performance.

The cancellations revealed nothing about F1's conscience. They revealed everything about its exposure. When the next geopolitical disruption arrives — and it will — the sport's resilience depends entirely on whether the remaining 20 hosts can absorb the financial slack. So far, they can. The question is how long that lasts.

Miami on May 1 is the first race where teams will deploy upgrades funded by the budget they did not spend flying to Bahrain.`,
  },
  {
    id: '0ec22749-97b9-4029-bfc1-d8eb57245fd5',
    title: "Three Races, Three Fifths: Norris Is Trapped in McLaren's Ceiling",
    tags: ["ANALYSIS","MCLAREN","CHAMPIONSHIP"],
    body: `Lando Norris has finished fifth in every race of 2026. Australia P5. China P5. Japan P5. The defending champion's consistency is undeniable. So is the ceiling above him.

Twenty-five points from three rounds puts Norris 47 behind championship leader Kimi Antonelli and 38 behind George Russell. The gap to the top is not closing. McLaren sits third in the constructors on 46 points — 89 behind Mercedes, 44 behind Ferrari. The car that won Norris the 2025 title has been replaced by one that cannot break into the top four.

The frustrating part for Norris is that the car is not slow. It is predictably, reliably, unspectacularly fifth-place fast. Oscar Piastri proved at Suzuka that the MCL61 can reach the podium — his P2 finish was McLaren's best result of the season. But Piastri's Suzuka was the exception. Norris's three consecutive fifths are the baseline.

McLaren's 2026 challenge is architectural. The new power unit regulations and Active Aero system demand a fundamentally different car philosophy than what delivered the 2025 championship. The team is learning. It is not yet competing.

Norris won his first F1 race at Miami in 2024. The circuit has been kind to McLaren historically. Round 4 is a sprint weekend — eight extra points available on Saturday, a format that rewards qualifying pace and short-stint aggression. Both suit Norris.

If Miami produces another P5, the pattern becomes a problem. Three fifths is a slow start. Six fifths is a crisis. Norris needs a podium before the European swing or the title defence becomes a mathematical impossibility by mid-season.`,
  },
  // #4 — new insert (no id)
  {
    insert: true,
    title: "Championship Check: Where All 22 Drivers Stand After Three Races",
    tags: ["CHAMPIONSHIP","ANALYSIS"],
    body: `Kimi Antonelli leads the 2026 championship by 9 points after three rounds. Two wins from three races for a 19-year-old in his debut season. The numbers after Japan paint a clear picture of who is delivering and who is not.

Mercedes own this championship. Antonelli on 72 points, George Russell on 63. Together they hold 135 constructor points — 45 clear of Ferrari, 89 clear of McLaren. The last time Mercedes dominated an opening stretch this comprehensively was 2020.

Charles Leclerc sits third on 49 points with results of P3, P4, and P3. Consistent, competitive, but unable to match Mercedes for outright pace. Lewis Hamilton is fourth on 41 points, his best result a P3 in China. The Ferrari is quick enough to podium. It is not quick enough to win.

McLaren's Lando Norris has 25 points from three consecutive fifth-place finishes. Oscar Piastri's P2 at Suzuka suggests the car has more to give, but Norris himself has not broken into the top four. The defending champion needs upgrades, not effort.

The midfield is competitive. Oliver Bearman has 17 points for Haas. Pierre Gasly has 15 for Alpine. Liam Lawson has 10 for Racing Bulls. All three are outscoring Max Verstappen, who sits ninth on 12 points as Red Bull's 2026 car struggles for pace after three seasons of dominance.

At the back, Cadillac's debut season has produced zero points from Sergio Perez and Valtteri Bottas. Audi and Williams each have 2 points. The gap between the front and the rear of the grid is the widest it has been since the hybrid era began.

Nineteen races remain. Miami on May 1 is a sprint weekend — double points opportunity, and the first real chance for the chasing pack to close ground.`,
  },
  {
    id: '379ac136-8433-4550-81a9-305bf7ee32dd',
    title: "Russell's Problem Isn't the Car. It's the Driver on the Other Side of the Garage.",
    tags: ["ANALYSIS","MERCEDES","CHAMPIONSHIP"],
    body: `George Russell has 63 points from three races. A win in Australia, a podium in China, and a fourth-place finish in Japan. By any normal measure, that is a strong start to a season.

By Mercedes' internal measure, it is not enough.

Kimi Antonelli has 72 points. Two wins from three races. The 19-year-old has outscored Russell at every round except Melbourne, where Russell took pole and converted without challenge. In China, Antonelli controlled the race from the front. In Japan, he qualified on pole and won again while Russell finished fourth — behind Oscar Piastri and Charles Leclerc.

That sequence is not a development curve. A rookie outpacing an established race winner over consecutive weekends is a performance statement. Russell qualified well at Suzuka. He delivered in the short runs. But when the race demanded tyre management, strategic patience, and clean execution under pressure, Antonelli was better.

Russell cannot afford to frame this as mentorship. Antonelli is not learning from him. Antonelli is beating him. The 9-point gap after three races is manageable on paper — 17 rounds remain. But the trajectory matters more than the margin. If Antonelli wins Miami, the gap grows to double digits and the internal dynamic shifts from rivalry to hierarchy.

Leclerc sits third on 49 points, two consecutive top-four finishes, and Ferrari's upgrade cycle is due. The threat to Russell is not only from his left. It is from behind.

Mercedes leads the constructors on 135 points because both drivers deliver. That advantage survives only if Russell treats every remaining qualifying session as a referendum on his status within the team. Miami on May 1 is a sprint weekend. Sprint weekends reward qualifying pace. That is supposed to be Russell's strength.`,
  },
  {
    id: '1418bcd5-8b84-403a-b787-ebb555308839',
    title: "Verstappen's Problem Isn't the Engine. It's a Chassis Red Bull Can't Fix.",
    tags: ["ANALYSIS","RED BULL","CHAMPIONSHIP"],
    body: `Max Verstappen has 12 points after three races. Ninth in the championship. Closer to Liam Lawson in tenth than to any driver fighting for the title. The four-time champion's start to 2026 is the worst of his career.

The engine is not the issue. Speaking to Autosport, Verstappen was direct about Red Bull's new Ford power unit: the deployment works, the raw power is competitive. The problem is underneath him.

Both China and Japan exposed a chassis that refuses to respond to setup changes. Verstappen spent laps stuck behind Pierre Gasly's Alpine at Suzuka — a car that should not have been in his mirrors. Teammate Isack Hadjar described the Red Bull as borderline undriveable at points during the Japanese Grand Prix.

Australia offered false hope. Hadjar qualified third. Verstappen recovered from a Q1 crash to finish sixth from P20 — the drive of the day. It looked like progress. The gaps told a different story. Hadjar was 0.785 seconds off pole in Melbourne. By China, Verstappen's deficit had grown to 0.938 seconds. The car was getting slower relative to the field, not faster.

The trajectory is the concern. Mercedes sits at 135 constructor points with Kimi Antonelli leading the drivers' championship on 72. George Russell has 63. Charles Leclerc has 49 points for Ferrari with two podiums from three races. Behind them, McLaren is accelerating — Oscar Piastri qualified and finished second at Suzuka, and Lando Norris has 25 points from three consistent fifth-place finishes.

Red Bull has 16 constructor points. That places them fifth, behind Haas. The team that won four consecutive drivers' titles and three consecutive constructors' championships between 2021 and 2024 is currently being outscored by Oliver Bearman.

Nineteen races remain. The power unit works. The chassis does not. For Red Bull, the question is no longer whether they can win in 2026. It is whether they can develop a fundamentally unbalanced car into something that regularly scores points before the season becomes unsalvageable.

Miami on May 1 will answer whether Australia's promise or Japan's reality defines Red Bull's trajectory.`,
  },
  {
    id: '2bae5b71-60a6-4e55-a008-cd70c03ea99f',
    title: "ADUO Explained: F1's Engine Catch-Up System Won't Deliver Quick Fixes",
    tags: ["ANALYSIS","CHAMPIONSHIP"],
    body: `Formula 1's 2026 power unit regulations introduced a mechanism called ADUO — Additional Development Upgrade Opportunities — designed to prevent the kind of unchecked engine dominance that defined the 2014-2021 era. Three races into the season, it is already relevant.

The system works differently from balance of performance in endurance racing. Instead of penalising the leader, ADUO gives trailing manufacturers additional development tools. Power unit makers judged two to four per cent behind the class leader receive one immediate upgrade window plus increased dyno hours and cost cap flexibility. Those more than four per cent adrift receive maximum concessions.

Mercedes currently leads the constructors' championship on 135 points — 45 clear of Ferrari's 90 and 89 clear of McLaren's 46. Kimi Antonelli's 72-point drivers' championship lead suggests Mercedes' power unit advantage is substantial. The question is whether ADUO can compress the gap before it becomes structural.

Audi's Mattia Binotto, speaking to Crash.net at Suzuka, was direct about the challenge. The lead times on engine development are long. Binotto acknowledged that most of Audi's deficit to the front-running teams comes from the power unit, not the chassis. His timeline for competitiveness is measured in years, not months — Audi has publicly targeted 2030 as its championship objective.

That honesty matters because ADUO cannot accelerate physics. An engine development cycle runs 18 to 24 months from concept to deployment. Extra dyno hours help with optimisation and reliability, but they do not compress fundamental architecture changes into a single season. The teams furthest behind will improve. They will not leapfrog.

The first ADUO performance assessment was originally scheduled for Miami on May 3, but the cancellation of Bahrain and Saudi Arabia shifted the calendar. The assessment window could now extend to Monaco in early June, pending FIA confirmation.

Max Verstappen sits ninth in the championship on 12 points — 60 behind Antonelli. Red Bull's struggles with their 2026 car are well documented, though whether the deficit is power unit or chassis remains debated. Charles Leclerc's 49 points for Ferrari, with two podiums from three races, suggest the Ferrari power unit is competitive even if the car lacks Mercedes' outright pace.

ADUO exists because F1 learned from its own history. Mercedes won eight consecutive constructors' titles between 2014 and 2021. The sport cannot afford a repeat. Whether the mechanism works fast enough to prevent a second period of dominance will become clear by mid-season. The early evidence suggests it will narrow gaps gradually, not eliminate them.`,
  },
  {
    id: '9227247b-2df7-4f50-a14c-4de054d3a33c',
    title: "Red Bull's Exodus: How Three Key Departures Broke the Machine That Won Four Titles",
    tags: ["ANALYSIS","RED BULL"],
    body: `Red Bull's infrastructure of dominance has fractured. Not on track — at least not yet catastrophically. But in the corridors of Milton Keynes, the departures read like a corporate collapse wrapped in Formula 1's polite language of mutual decisions and new opportunities.

Three years, three defining losses. And the 2026 season is exposing why.

Adrian Newey left in May 2024. Seventeen years at Red Bull, gone. The timing was symbolically brutal — announced on the 30th anniversary of Ayrton Senna's death, as Autosport reported. Newey had designed title-winning cars across two decades and three teams. At Red Bull, he engineered four consecutive drivers' championships between 2021 and 2024. But the internal power struggle that surfaced in early 2024 made staying untenable. By early 2025, he was Aston Martin's managing technical partner.

Before Newey, Rob Marshall departed for McLaren in May 2023. Seventeen years at Red Bull — he had been there since 2006, serving as chief engineer and architect of the team's mechanical platform during its most successful era. That influence has visibly matured at McLaren, where Marshall now works alongside Peter Prodromou, himself a former Red Bull engineer. The two have accelerated Woking's competitive trajectory. Oscar Piastri's P2 at Suzuka is evidence.

Lee Stevenson, the chief mechanic who built direct rapport with Max Verstappen across a decade, left in March 2024 after 18 years. He moved to Sauber, then was promoted to team manager when the team became Audi for 2026.

Three departures. Three different domains — aerodynamics, engineering, operations. One pattern: institutional knowledge haemorrhaging out of a team previously characterised by a stability rarely seen in Formula 1.

The evidence is on the timing sheet. Max Verstappen sits ninth in the championship with 12 points after three races. He finished eighth at Suzuka, behind Charles Leclerc, Oscar Piastri, and George Russell. Kimi Antonelli leads with 72 points. Mercedes commands the constructors with 135 points. Red Bull has 16 — fifth in the standings, behind Haas.

These are not coincidences. Newey's absence means the 2026 car lacks the aerodynamic innovation that defined Red Bull's title runs. Marshall's departure left a gap in engineering depth that McLaren has directly filled. Stevenson's exit disrupted the human continuity that keeps a top team coherent under pressure.

Red Bull built a machine between 2021 and 2024. It was never invulnerable. It was built by people — a chief designer, a chief engineer, a mechanic who knew which bolt to tighten when Verstappen signalled instability through the steering wheel. Remove those people and you remove the machine's identity.

Verstappen still has pace. The team still has resources. But the talent that made Red Bull the benchmark has found better offers elsewhere. Nineteen races remain. Miami on May 1 will test whether new hires can replicate what took Newey, Marshall, and Stevenson a decade to build. The early evidence suggests they cannot.`,
  },
  {
    id: '52deaefd-179a-4c26-ac30-a6dfa464636a',
    title: "Norris Names the Four People Who Made Him World Champion",
    tags: ["ANALYSIS","MCLAREN"],
    body: `Lando Norris has 25 points from three races in defence of his 2025 title. Three consecutive fifth-place finishes. The car is not where it needs to be. But the driver is the product of four specific people, and speaking to Motorsport.com, Norris named every one of them.

His father came first. "Number one is my dad," Norris said. "He had his love for racing when he was a kid. When he grew up, he couldn't really do it. But he worked hard and gave the opportunity to both my brother and myself to get into racing. He allowed me to live my dream."

The story starts earlier than karting. Norris was three or four years old, playing Gran Turismo on PlayStation with his father. Before he ever sat in a racing car, he was competing on screen. The instinct was already there. His father gave it a direction.

Before F1, Norris was obsessed with motorbikes. That introduced him to Valentino Rossi — his second influence and childhood hero. "I was more into motorbikes when I was younger than I was into four-wheel," Norris told Motorsport.com. Rossi's showmanship and longevity in MotoGP shaped how Norris understood what a career in motorsport could look like.

The third figure is McLaren Racing CEO Zak Brown. Norris has worked with Brown since joining McLaren and describes a relentless operator. "I don't think you'll genuinely ever find someone who works as much as Zak. If you ever spend a day with Zak, you'll be able to talk to him for about five minutes because the rest is on calls, meetings, emails, texts, and everything else." Brown's business instincts rebuilt McLaren commercially while Norris rebuilt it competitively.

The fourth is team principal Andrea Stella, who arrived from Ferrari and reshaped Woking's technical culture from the inside. "A person who always opens your eyes to something you'll never have thought of, gives you extra thoughts, someone who makes you rethink many things," Norris said.

Stella's analytical depth and Brown's organisational drive together created the environment that won McLaren back-to-back constructors' championships in 2024 and 2025. Norris won the drivers' title last year. The foundation those four people built is the reason.

Now the challenge shifts. Norris sits fifth in the 2026 standings, 47 points behind Kimi Antonelli's Mercedes. McLaren has 46 constructor points — 89 behind Mercedes' 135. The people who made Norris a champion are the same people who need to close that gap. Miami on May 1 will show whether the machine they built can adapt to regulations that currently favour the team ahead of them.`,
  },
  {
    id: 'cca13213-b917-40fe-a307-ff5eeb5f835e',
    title: "Oliver Bearman Has More Points Than Max Verstappen. That Is Not a Typo.",
    tags: ["ANALYSIS","HAAS","CHAMPIONSHIP"],
    body: `Oliver Bearman has 17 points after three races. Max Verstappen has 12. The 20-year-old Haas driver, in his first full F1 season, is outscoring a four-time world champion by five points. That sentence should not make sense. It does.

Bearman finished P7 in Australia, P10 in China, and P10 in Japan. None of those results came from safety car luck or attrition clearing the field. He qualified, raced, and extracted points from a Haas car that nobody expected to be competitive in 2026. Teammate Esteban Ocon has scored zero points across the same three races. The gap between them tells you this is driver performance, not car performance.

Haas sits fourth in the constructors' championship on 18 points. Fourth. Ahead of Red Bull on 16, ahead of Alpine on 15, ahead of Racing Bulls on 14. The team that spent years as a punchline is now outperforming the organisation that won four consecutive drivers' titles.

The context matters. Haas's 18 points come almost entirely from Bearman. Ocon's contribution is negligible. This is not a two-driver operation delivering consistent results — it is one driver carrying the team while his teammate struggles with the same machinery. That pattern is unsustainable across a 20-race season, but it makes Bearman's individual performances more impressive, not less.

Verstappen's 12 points reflect Red Bull's chassis problems rather than his own decline. He drove from P20 to P6 in Australia — the drive of the weekend. But a great recovery drive and 8 points do not change the fact that a rookie at Haas is ahead of him in the standings. The machinery gap between Red Bull and Haas has compressed to the point where driver extraction matters more than team pedigree.

Bearman is part of a rookie class that includes Kimi Antonelli (72 points, leading the championship), Isack Hadjar, Arvid Lindblad, and Gabriel Bortoleto. Antonelli gets the headlines. Bearman deserves attention for a different reason — he is proving that a driver can score consistently from a midfield car when the regulations reset the competitive order.

Miami on May 1 will test whether Haas's early form is genuine or circumstantial. If Bearman scores again and Verstappen doesn't, the standings will stop looking like an anomaly and start looking like the new reality.`,
  },
  {
    id: 'a1a1b6dc-2724-4cd8-81fd-67a8b2c1f64f',
    title: "Aston Martin's Problem Is the Chassis, Not the Honda. The Data Proves It.",
    tags: ["ANALYSIS","ASTON MARTIN"],
    body: `Fernando Alonso's 2026 season reads like a slow-motion crisis for Aston Martin. Three races, zero points, and a Japanese Grand Prix where the team was nowhere near the fight. Lance Stroll did not finish at Suzuka. The headlines blame Honda's troubled power unit. The data tells a different story.

According to BBC Sport's GPS analysis shared across all teams, more than half of Aston Martin's time deficit to the front comes from chassis performance, not engine power. The team qualifies an average of 3.6 seconds off the pace across the first three races. For context, Alpine — currently fifth-fastest — sits 1.268 seconds back. Haas is 1.567 seconds adrift. Aston Martin's deficit is in a different category entirely.

Adrian Newey, who joined as managing technical partner in early 2025, has acknowledged the split publicly. After Australia he described the team as perhaps the fifth-best on chassis merit alone, with potential for Q3 appearances and progress toward the front over time. The implication is straightforward: install a competitive engine in the current Aston Martin and the car would fight where Alpine and Haas currently operate. That is not a compliment to the chassis. It is a diagnosis.

Honda's reliability problems are real. Vibration issues have plagued the power unit across all three rounds, and the question of whether those vibrations originate in the engine itself or in how it mounts to the chassis remains unresolved. Until Aston Martin and Honda can separate cause from symptom, assigning blame is performative rather than productive.

The car is overweight. It struggles in high-speed corners. Newey's design influence arrived late — his wind tunnel programme did not begin until April 2025, giving the team a compressed development timeline for entirely new regulations. The current car reflects that compression.

Alonso has 4 points from three races. He is 44 years old, in his 23rd F1 season, driving machinery that cannot reward his experience. Stroll has scored nothing. Between them, Aston Martin sits on 4 constructor points — 131 behind Mercedes, 86 behind Ferrari.

The Honda engine will improve. ADUO concessions will provide additional development resources for struggling manufacturers. But concessions fix power units. They do not fix a chassis that loses two seconds per lap in the corners before the straight even begins.

Miami on May 1 will not transform Aston Martin's season. What it will reveal is whether Newey's design direction is beginning to show in the data, even if the results remain buried in the lower half of the grid.`,
  },
  {
    id: '92185685-8fbc-444a-909d-860129d326b2',
    title: "Fernando Alonso Has Not Won in 13 Years. He Is Still the Best Pure Driver on the Grid.",
    tags: ["ANALYSIS","ASTON MARTIN"],
    body: `Fernando Alonso is 44 years old, has started over 400 Formula 1 grands prix, and has not won a race since the 2013 Spanish Grand Prix. By every conventional metric, he should be irrelevant. He is not.

According to technical analysts Mark Hughes and Edd Straw, who have tracked Alonso's career from his Minardi debut 25 years ago through his 2023 podium run at Aston Martin, the Spaniard's driving style is fundamentally different from anyone else on the grid.

Hughes describes it from trackside: watching Alonso through the Esses at the Circuit of The Americas reveals coordination between steering and throttle that no other driver replicates. He dances between the two inputs, adjusting in real time rather than committing to a fixed plan. At Monaco's Tabac corner, Hughes observed Alonso using the brakes in an extreme way on a car that refused to turn in — sacrificing momentum to gather data, then threading through with surgical precision. The same approach, the same execution, lap after lap.

Straw's assessment is blunter. Alonso's driving style is, in his words, ludicrous. The consistency with which he operates at the absolute edge of grip — where most drivers would crash — defies what should be physically possible at his age and experience level. The feel required to maintain that edge comes through the front tyres and the steering. That sensory feedback is the foundation of everything Alonso does in a car.

The technique is counterintuitive. Alonso drives reactively, responding to what the steering tells him rather than anticipating it. But his interpretation speed is so fast that the reactive style becomes functionally proactive. He processes feedback and adjusts within the same corner, not the next one.

This explains how Alonso remained competitive in inferior machinery throughout his career. When early Renault cars lacked front-end grip, Alonso would lean into the understeer to an extreme degree, forcing the steering to give him the data point he needed immediately. His teammate Giancarlo Fisichella was reportedly stunned — the car did not have a front end, yet Alonso drove as if it did.

The adaptive methodology is the point. Alonso did not develop one fixed driving style. He developed the ability to extract feel from any car, regardless of its limitations. Each machine presents a different puzzle. He solves them all the same way — through the steering column, through the brake pedal, through reactions faster than the car itself can communicate.

Aston Martin's 2026 season has been difficult. Alonso has 4 points from three races. The car is overweight and struggles in high-speed corners. Adrian Newey's design influence has not yet materialised in the results. None of that changes the fundamental observation: at 44, Alonso's hands and feet remain among the fastest and most precise on the grid. Kimi Antonelli leads the championship at 19 with 72 points. Alonso sits near the back with 4. The gap between them is machinery. The gap in pure driving technique is considerably smaller.

Thirteen years without a victory is not evidence of decline. It is evidence that the sport's most technically gifted driver has spent over a decade in cars that cannot match his ability. Whether Aston Martin can build him one before he retires is the only remaining question.`,
  },
  {
    id: '8949b940-a40c-4cd4-8e0a-e9ecf1ee682d',
    title: "Stroll Goes GT Racing While F1 Takes a Break. The Reason Why Says Everything.",
    tags: ["ANALYSIS","ASTON MARTIN"],
    body: `Lance Stroll has zero points from three Formula 1 races. His Aston Martin is 2.3 seconds off the pace. The championship is not going to plan. So when the cancelled Bahrain and Saudi Arabia rounds opened a month-long gap in the calendar, Stroll did something most F1 drivers would not — he entered a GT race.

This weekend Stroll will contest the opening round of the GT World Challenge at Paul Ricard, driving an Aston Martin Vantage AMR GT3 EVO for Belgian team Comtoyou Racing alongside former F1 driver Roberto Merhi and Aston Martin Academy driver Mari Boya.

The decision came at Suzuka. Speaking to Crash.net, Stroll explained it happened over dinner with friends on Saturday evening during the Japan weekend. A month without racing was too long to sit idle. A GT car was available. The opportunity materialised in days.

The motivation is revealing. "In Formula 1, you don't always have the opportunity to win," Stroll told Crash.net. "Here, it's very competitive, but even if it's our first time and we lack experience, if everything comes together — good setup, good feeling — winning is possible. That doesn't really exist in Formula 1. That's also a big motivation for me to be here."

That quote cuts to the core of Stroll's 2026 reality. In F1, Aston Martin's car cannot compete for points. Adrian Newey's design influence has not yet reached the track. Fernando Alonso, his teammate, has 4 points from three races and is fighting the same deficit. For Stroll, GT racing offers something F1 currently cannot — a competitive car and a realistic shot at a podium.

The machinery difference is stark. Less downforce, less power, more mechanical movement. Stroll described being able to attack kerbs and follow other cars closely — both things the 2026 F1 regulations and Active Aero system have not yet delivered despite being designed to enable closer racing.

He is not alone in filling the gap. Max Verstappen, ninth in the F1 championship on 12 points, is preparing for the Nurburgring 24 Hour during the same break. Both drivers are using the unplanned calendar window to race competitively while their F1 teams develop cars that currently fall short.

Stroll's mindset stays constant regardless of the category. "For me, whenever I'm in the car with my helmet on, whether it's here, Formula 1, or even karting, it's always the same mindset," he told Crash.net. "But here, it's nice: fewer media duties, more time in the garage working with the team and just driving and enjoying it."

If Paul Ricard goes well, Stroll plans to continue. The Monza GT round later in the season is possible, with up to five additional rounds in the second half of the year fitting around the F1 calendar.

The F1 championship resumes at Miami on May 1. When Stroll returns, nothing about Aston Martin's competitive position will have changed. But Stroll will have raced, competed, and possibly stood on a podium — something his F1 season may never offer.`,
  },
  {
    id: '42c87524-09f7-4890-83ca-4c184fa1d050',
    title: "Leclerc Has 49 Points and Zero Wins. Ferrari's 2026 Problem Is Pace, Not Consistency.",
    tags: ["ANALYSIS","FERRARI","CHAMPIONSHIP"],
    body: `Charles Leclerc has 49 points from three races. P3 in Australia, P4 in China, P3 in Japan. Two podiums, no wins, and a 23-point deficit to championship leader Kimi Antonelli that grows every weekend Mercedes puts both cars on the front two rows.

The consistency is real. Leclerc has not finished lower than fourth all season. Among the top four in the standings, he is the only driver without a result outside the podium places — until China, where he finished just off it. That reliability has kept Ferrari second in the constructors on 90 points, 45 behind Mercedes but 44 clear of McLaren.

The problem is the ceiling. Ferrari arrived in 2026 with pre-season optimism built on competitive testing times and a regulation change that was supposed to reset the order. Three races in, the order has not reset. It has consolidated. Mercedes' advantage is not a setup trick or a qualifying mode. Antonelli and Russell have been faster in race trim at every circuit. Leclerc is extracting the maximum from a car that currently has a lower maximum than the Mercedes.

Lewis Hamilton's presence was supposed to accelerate Ferrari's development curve. The seven-time champion sits fourth on 41 points — respectable, but his best result is P3 in China. Hamilton and Leclerc are finishing close to each other at every round, which confirms the car's level rather than either driver underperforming.

Ferrari's 2026 power unit is competitive. The chassis generates consistent downforce. What the package lacks is the final three-tenths that separate a podium car from a race-winning car. That gap is not closed by driver talent. It is closed by development.

Three weeks separate Japan and Miami. Ferrari's upgrade cycle typically accelerates into the European season. If a meaningful aero package arrives for Round 4, Leclerc has the skill to convert it into a win. If it does not, the 45-point constructors deficit to Mercedes will grow beyond recovery before summer.

Leclerc does not have a consistency problem. He has a car problem. The question is whether Ferrari can fix it before the championship becomes a two-driver contest at the front.`,
  },
];

export default async (req) => {
  const start = Date.now();
  const results = [];
  try {
    for (const a of ARTICLES) {
      const excerpt = firstTwoSentences(a.body);
      if (a.insert) {
        // New article: INSERT
        const slug = makeSlug(a.title) + '-' + Date.now().toString(36);
        const inserted = await sb('articles', 'POST', {
          title: a.title,
          slug,
          body: a.body,
          excerpt,
          tags: a.tags,
          author: 'GridFeed Staff',
          status: 'published',
          published_at: new Date().toISOString(),
        });
        const newId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
        results.push({ action: 'insert', title: a.title, slug, id: newId });
      } else {
        // Existing article: PATCH (leave slug alone to preserve old links)
        const ok = await sb(`articles?id=eq.${a.id}`, 'PATCH', {
          title: a.title,
          body: a.body,
          excerpt,
          tags: a.tags,
        });
        results.push({ action: 'update', id: a.id, title: a.title, ok });
      }
    }
    await logSync('bulk-rewrite', 'success', results.length, `Rewrote ${results.length} articles`, Date.now() - start);
    return json({ ok: true, total: results.length, results });
  } catch (err) {
    await logSync('bulk-rewrite', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message, results }, 500);
  }
};
