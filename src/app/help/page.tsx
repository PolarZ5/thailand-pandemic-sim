import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How to use — Thailand Pandemic Simulator",
};

export default function HelpPage() {
  return (
    <main className="min-h-screen w-full overflow-y-auto bg-gray-950 text-gray-200">
      <div className="max-w-3xl mx-auto px-6 py-10 leading-relaxed">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">How to use the simulator</h1>
          <Link
            href="/"
            className="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            ← back to simulator
          </Link>
        </div>

        <Section title="What this is">
          <p>
            A web-based pandemic-spread simulator running on a synthetic
            Thailand population grid, displayed on a real map. The simulation
            runs entirely in your browser (in a Web Worker), so nothing is
            sent to a server. You pick disease parameters and a seed location,
            press <em>Play</em>, and watch the SEIR dynamics unfold across the
            country until the epidemic burns out.
          </p>
        </Section>

        <Section title="Quick start (60 seconds)">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>
              Pick a <strong>Disease preset</strong> in the right-hand panel
              (Flu / COVID-19 / Measles), or build a Custom profile with the
              sliders.
            </li>
            <li>
              <strong>Click anywhere on Thailand</strong> on the map to set the
              seed point — the yellow marker is where Patient&nbsp;0 starts.
              Clicks outside the country boundary are rejected.
            </li>
            <li>
              Press <strong>▶ Start</strong>. The infection spreads outward
              from the seed; the SEIR chart updates in real time.
            </li>
            <li>
              The simulation auto-stops when no exposed or infected agents
              remain. A summary modal shows attack rate, peak day, and peak
              R(t).
            </li>
            <li>
              Click <strong>↺ Reset</strong> or <strong>Run again</strong> to
              start over with different parameters or a different seed.
            </li>
          </ol>
        </Section>

        <Section title="Parameter glossary">
          <Glossary
            items={[
              ["Disease preset", "Bundles R₀ + latent + infectious periods. Switching to Custom unlocks all sliders."],
              ["Grid resolution", "Cell size. 25 km is fastest (a few thousand cells). 1 km is most detailed but slowest. 5 km is the recommended sweet spot."],
              ["Total population", "Rescales the synthetic density so the country sums to your chosen total (in millions). Default 70 M ≈ real Thailand."],
              ["R₀", "Basic reproduction number — average secondary infections per case in a fully susceptible population."],
              ["Latent period", "Mean days from exposure (E) to becoming infectious (I)."],
              ["Infectious period", "Mean days an infected person sheds before recovery (R)."],
              ["Mobility α", "Distance-decay exponent for the gravity-style mixing kernel between cells. Higher α ⇒ infection stays more local."],
              ["Mobility weight", "Fraction of contact pressure that comes from neighbouring cells (vs. the home cell). 0 = fully local, 1 = fully non-local."],
              ["Initial infected at seed", "Number of agents seeded as I in the seed cell at day 0."],
              ["Speed", "Wall-clock pacing — how many simulated days are stepped per real second."],
            ]}
          />
        </Section>

        <Section title="Map visualization">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Density layer</strong> (viridis ramp, purple → teal →
              yellow) shows population per cell. Yellow / green areas are
              dense — Bangkok is the brightest cluster.
            </li>
            <li>
              <strong>Infection layer</strong> (red → orange → yellow) shows
              the fraction of the cell that is currently infected (I / pop).
            </li>
            <li>
              <strong>Alpha sliders</strong> in the panel let you fade either
              layer in or out.
            </li>
            <li>
              <strong>Saturation sliders</strong> set the value at which the
              color ramp tops out — turn them down to make secondary cities
              pop, or up to keep the overall picture readable.
            </li>
            <li>
              The two <strong>color bars</strong> at the bottom-left of the
              map always reflect the current saturation values.
            </li>
          </ul>
        </Section>

        <Section title="Charts &amp; metrics">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Stacked S/E/I/R area</strong> on the left axis (percent
              of total population).
            </li>
            <li>
              <strong>New infections / day</strong> line on the right axis
              (raw count).
            </li>
            <li>
              <strong>Currently infected</strong> line on the right axis (raw
              count of I).
            </li>
            <li>
              <strong>R(t)</strong> is a smoothed estimate from the last 7 days
              vs. the previous 7 days, scaled by the remaining susceptible
              fraction. It only appears after day&nbsp;7.
            </li>
          </ul>
        </Section>

        <Section title="What the model actually is (honest caveats)">
          <p className="mb-2">
            This is a <strong>spatial stochastic compartmental model</strong>
            with tau-leap Poisson noise on new infections — not a true
            individual-based agent model. Each cell tracks aggregate S/E/I/R
            counts as floats; randomness enters only as Poisson draws on the
            expected number of new exposures per cell per day. Local mixing
            uses a 2-cell-radius distance-decay kernel; long-range
            "commuter" jumps weighted by population are sampled every 7 days.
          </p>
          <p>
            The synthetic density is a stand-in: city centers from public
            sources + Gaussian falloff + a rural baseline, masked by the real
            Natural Earth 1:50m Thailand boundary so cells never bleed into
            neighbouring countries.
            The <code>DensitySource</code> interface lets a real HRSL /
            WorldPop / mobile-network grid be plugged in without touching the
            simulation engine.
          </p>
        </Section>

        <Section title="Citation">
          <p>
            Model inspired by{" "}
            <a
              href="https://doi.org/10.1088/1742-6596/1144/1/012041"
              className="text-blue-400 hover:text-blue-300 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Laosiritaworn, Laosiritaworn &amp; Laosiritaworn (2018),
            </a>{" "}
            <em>Herd immunity estimation of flu-like disease spreading in
            SEIR population: The sociophysics modelling via Monte Carlo
            simulation on discrete-spin model</em>, J. Phys.: Conf. Ser. 1144
            012041.
          </p>
        </Section>

        <div className="pt-4">
          <Link
            href="/"
            className="inline-block bg-red-600 hover:bg-red-500 text-white
                       rounded px-4 py-2 text-sm font-medium transition"
          >
            ← back to simulator
          </Link>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-lg font-semibold mb-2 text-gray-100">{title}</h2>
      <div className="text-sm text-gray-300 space-y-2">{children}</div>
    </section>
  );
}

function Glossary({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map(([term, def]) => (
        <div className="contents" key={term}>
          <dt className="font-mono text-gray-100">{term}</dt>
          <dd className="text-gray-300">{def}</dd>
        </div>
      ))}
    </dl>
  );
}
