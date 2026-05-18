import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How to use — Thailand Pandemic Simulator",
};

export default function HelpPage() {
  return (
    <main className="h-screen w-full overflow-y-auto bg-gray-950 text-gray-200">
      <div className="max-w-3xl mx-auto px-6 py-10 leading-relaxed">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 pb-4
                        border-b border-gray-800">
          <div>
            <h1 className="text-3xl font-semibold bg-gradient-to-r
                           from-blue-400 to-purple-400 bg-clip-text
                           text-transparent">
              Thailand Pandemic Simulator
            </h1>
            <p className="text-sm text-gray-400 mt-1">Documentation &amp; model reference</p>
          </div>
          <Link
            href="/"
            className="text-sm text-blue-400 hover:text-blue-300 underline
                       whitespace-nowrap"
          >
            ← back to simulator
          </Link>
        </div>

        <Section title="What this is" icon="🦠">
          <p>
            A web-based pandemic-spread simulator running on a synthetic
            Thailand population grid, displayed on a real map. The simulation
            runs entirely in your browser (in a Web Worker), so nothing is
            sent to a server. You pick disease parameters and a seed
            location, press <em>Play</em>, and watch SEIR dynamics unfold
            across the country until the epidemic burns out.
          </p>
        </Section>

        <Section title="Quick start (60 seconds)" icon="🚀">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>
              Pick a <strong>Disease preset</strong> in the right-hand panel
              (Flu / COVID-19 / Measles), or build a Custom profile with the
              sliders.
            </li>
            <li>
              <strong>Click anywhere on Thailand</strong> on the map to set
              the seed point — the yellow marker is where Patient 0 starts.
              Clicks outside the country boundary are rejected.
            </li>
            <li>
              Press <strong>▶ Start</strong>. The infection spreads outward
              from the seed; the SEIR chart updates in real time.
            </li>
            <li>
              The simulation auto-stops when no exposed or infected agents
              remain. A summary modal shows attack rate, peak day, and
              age-stratified attack rates (Prem-style figure).
            </li>
            <li>
              Click <strong>↺ Reset</strong> or <strong>Run again</strong>
              to start over with different parameters or a different seed.
            </li>
          </ol>
        </Section>

        {/* ====== MODEL SECTION ====== */}
        <div className="mt-10 pt-6 border-t border-gray-800">
          <h2 className="text-2xl font-semibold text-gray-100 mb-3">
            How the simulation works
          </h2>
          <p className="text-sm text-gray-400 mb-6">
            A spatial stochastic compartmental SEIR model with age-structured
            mixing (Prem et al. 2021 contact matrices) and gravity-style
            between-cell mobility. Every concept below is wired exactly the
            same way in <code className="text-blue-300">src/sim/engine.ts</code>.
          </p>

          <Subsection title="1. The state" icon="📦">
            <p>
              The country is sliced into a square grid (1, 5, or 25 km cells)
              clipped to the real{" "}
              <ExtLink href="https://www.naturalearthdata.com/downloads/50m-cultural-vectors/">
                Natural Earth 1:50m
              </ExtLink>{" "}
              Thailand boundary. Each cell <Math>i</Math> carries a population
              <Math>N(i)</Math> from a synthetic density (city centers +
              Gaussian falloff + rural baseline; see
              {" "}<code className="text-blue-300">src/data/density.ts</code>).
              That population is then split across{" "}
              <strong>16 five-year age bands</strong>{" "}
              <Math>a ∈ &#123;1..16&#125;</Math> using Thailand&apos;s UN
              World Population Prospects pyramid:
            </p>
            <Eq>
              {`N_a(i)  =  N(i) · π_a            where π_a = THAILAND_AGE_FRACTIONS[a]`}
            </Eq>
            <p>
              Each cell then tracks four compartments per age band:
            </p>
            <Eq>
              {`S_a(i),  E_a(i),  I_a(i),  R_a(i)        with  S+E+I+R = N`}
            </Eq>
            <p className="text-xs text-gray-500 mt-1">
              i.e. 4 × 16 = 64 floats per cell. At 5 km that&apos;s ≈ 37 k
              cells × 64 = 2.4 M floats kept in Float32Arrays.
            </p>
          </Subsection>

          <Subsection title="2. The contact matrix" icon="🧑‍🤝‍🧑">
            <p>
              Within a cell, mixing is driven by Thailand&apos;s synthetic
              contact matrices from{" "}
              <ExtLink href="https://doi.org/10.1371/journal.pcbi.1009098">
                Prem, Cook &amp; Jit (2021)
              </ExtLink>.{" "}
              For each setting <Math>s ∈ &#123;home, work, school, other&#125;</Math>
              the entry <Math>M^s_&#123;ab&#125;</Math> is the mean daily number of
              contacts an individual of age <Math>a</Math> has with people of
              age <Math>b</Math>. The user&apos;s intervention sliders weight
              the four settings into an{" "}
              <em>effective</em> matrix:
            </p>
            <Eq>
              {`M_ab(t)  =  m_home·M^home_ab  +  m_work·M^work_ab
            +  m_school·M^school_ab  +  m_other·M^other_ab`}
            </Eq>
            <p>
              School closure becomes <Math>m_&#123;school&#125; = 0</Math>,
              full lockdown ≈ <Math>m_&#123;work&#125; = m_&#123;other&#125; = 0.1</Math>,
              etc. Heatmaps for each setting are rendered in the end-of-run
              modal so you can <em>see</em> what the model is using.
            </p>
          </Subsection>

          <Subsection title="3. Force of infection" icon="📈">
            <p>
              The per-age force of infection in cell <Math>i</Math> per day is:
            </p>
            <Eq>
              {`λ_a(i)  =  q · Σ_b  M_ab  ·  pressure_b(i)`}
            </Eq>
            <p>
              The "pressure" is a convex combination of within-cell infectious
              fraction and a gravity-weighted neighbour average — this is what
              couples cells to each other:
            </p>
            <Eq>
              {`pressure_b(i)  =  (1 − w) · I_b(i) / N_b(i)
              +  w  · Σ_j κ(d_ij) · I_b(j) / Σ_j κ(d_ij) · N_b(j)

with the gravity kernel       κ(d)  =  1 / (1 + d)^α
truncated at d ≤ 2 cells.`}
            </Eq>
            <p>
              <Math>w</Math> is the <em>Mobility weight</em> slider,{" "}
              <Math>α</Math> is the <em>Mobility α</em> slider. The
              neighbour-side I and N are aggregated across ages (we treat
              cross-cell trips as age-agnostic for performance — within-cell
              age structure already does the heavy lifting).
            </p>
          </Subsection>

          <Subsection title="4. R₀ calibration via the next-generation matrix" icon="🎯">
            <p>
              We want <Math>R₀</Math> on the slider to actually deliver
              <Math> R₀</Math> at day 0, even after interventions reshape
              <Math> M</Math>. Following the next-generation matrix (NGM)
              construction of{" "}
              <ExtLink href="https://royalsocietypublishing.org/doi/10.1098/rsif.2009.0386">
                Diekmann, Heesterbeek &amp; Roberts (2010)
              </ExtLink>{" "}
              for a closed SEIR system, the dominant eigenvalue of{" "}
              <Math>q · M · D_inf</Math> equals <Math>R₀</Math>. So at every
              re-init we compute:
            </p>
            <Eq>
              {`q  =  R₀  /  ( ρ(M_eff)  ·  D_inf )

ρ( · ) = dominant eigenvalue, found by power iteration (60 steps)`}
            </Eq>
            <p>
              Changing any intervention slider triggers a re-init,
              re-computes <Math>ρ(M)</Math> and re-tunes <Math>q</Math>.
              That&apos;s why locking <Math>R₀</Math> at 2.5 still makes
              sense as you toggle interventions — the per-contact
              probability adjusts so the leading eigenvalue stays at 2.5.
            </p>
          </Subsection>

          <Subsection title="5. Stochastic update (tau-leap)" icon="🎲">
            <p>
              We use a one-day tau-leap{" "}
              <ExtLink href="https://doi.org/10.1063/1.1378322">
                (Gillespie 2001)
              </ExtLink>{" "}
              for new exposures, then deterministic exponential transitions
              for E→I and I→R. Per cell, per age:
            </p>
            <Eq>
              {`ΔE_a   ~  Poisson( S_a · (1 − exp(−λ_a · Δt)) )

ΔE→I_a  =  E_a · (1 − exp(−σ · Δt)),    σ = 1 / T_latent
ΔI→R_a  =  I_a · (1 − exp(−γ · Δt)),    γ = 1 / T_infectious

S_a  ←  S_a − ΔE_a
E_a  ←  E_a − ΔE→I_a + ΔE_a
I_a  ←  I_a + ΔE→I_a − ΔI→R_a
R_a  ←  R_a + ΔI→R_a`}
            </Eq>
            <p>
              Poisson sampling at the new-exposure step is what gives the
              characteristic stochastic flavour — small outbreaks can fizzle,
              identical parameters give different outcomes, R(t) wobbles.
              E→I and I→R are continuous-mass for performance; with thousands
              of agents per (cell, age) the difference vs. tracking individual
              ages-of-infection is invisible.
            </p>
          </Subsection>

          <Subsection title="6. Long-range commuter jumps" icon="✈️">
            <p>
              Once a week we fire 8 stochastic{" "}
              <em>commuter jumps</em>: pick a source cell weighted by
              population, pick a destination cell weighted by population,
              and convert ~1 traveller&apos;s worth of contact at the
              destination into an exposure event (spread across destination
              age bands by their relative S share). This models the rare,
              long-distance ignition events that gravity-kernel local mixing
              can&apos;t reach in a country shaped like Thailand.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Jumps switch off once total <Math>I</Math> drops below ~200
              agents so the tail of the epidemic actually reaches an
              end-of-epidemic state instead of being constantly re-ignited.
            </p>
          </Subsection>

          <Subsection title="7. End of epidemic" icon="🏁">
            <p>
              We declare the run over when{" "}
              <strong>both</strong>:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                A real outbreak has happened — peak <Math>E + I</Math> has
                exceeded <Math>max(500, 5 · I₀)</Math>, AND
              </li>
              <li>
                Current <Math>E + I &lt; 50</Math> active agents.
              </li>
            </ul>
            <p>
              Float32 round-off and weekly jumps mean total <Math>E + I</Math>
              never truly reaches zero in a country-sized population — once
              we&apos;re under ~50 active agents the epidemic is
              effectively over.
            </p>
          </Subsection>
        </div>

        {/* ====== UI REFERENCE ====== */}
        <div className="mt-10 pt-6 border-t border-gray-800">
          <h2 className="text-2xl font-semibold text-gray-100 mb-3">
            UI reference
          </h2>
        </div>

        <Section title="Parameter glossary" icon="📋">
          <Glossary
            items={[
              ["Disease preset", "Bundles R₀ + latent + infectious periods. Switching to Custom unlocks all sliders."],
              ["Grid resolution", "Cell size. 25 km is fastest (a few thousand cells). 1 km is most detailed but slowest. 5 km is the recommended sweet spot."],
              ["Total population", "Rescales the synthetic density so the country sums to your chosen total (in millions). Default 70 M ≈ real Thailand."],
              ["R₀", "Basic reproduction number — average secondary infections per case in a fully susceptible population. Anchored via the NGM eigenvalue, see §4."],
              ["Latent period", "Mean days from exposure (E) to becoming infectious (I)."],
              ["Infectious period", "Mean days an infected person sheds before recovery (R)."],
              ["Mobility α", "Distance-decay exponent for the gravity-style mixing kernel between cells. Higher α ⇒ infection stays more local."],
              ["Mobility weight", "Fraction of contact pressure from neighbouring cells (vs. the home cell). 0 = fully local, 1 = fully non-local."],
              ["Initial infected at seed", "Number of agents seeded as I in the seed cell at day 0."],
              ["Interventions", "Per-setting multipliers (home/work/school/other) on the Prem contact matrix. q is recalibrated so R₀ stays on its slider value."],
              ["Speed", "Wall-clock pacing — how many simulated days are stepped per real second."],
            ]}
          />
        </Section>

        <Section title="Map visualization" icon="🗺️">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Density layer</strong> (viridis ramp, purple → teal →
              yellow) shows population per cell.
            </li>
            <li>
              <strong>Infection layer</strong> (red → orange → yellow) shows
              the fraction of the cell that is currently infected
              (<Math>I / N</Math>).
            </li>
            <li>
              The two <strong>color bars</strong> at bottom-left of the map
              reflect the current alpha / saturation slider values.
            </li>
            <li>
              Click anywhere inside Thailand to move the seed. Clicks in the
              sea or in a neighbouring country are rejected with a yellow
              toast.
            </li>
          </ul>
        </Section>

        <Section title="Charts &amp; metrics" icon="📊">
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
              count of <Math>I</Math>).
            </li>
            <li>
              <strong>R(t)</strong> is a smoothed estimate from the last 7
              days vs. the previous 7 days, scaled by remaining susceptibles.
              It only appears after day 7.
            </li>
            <li>
              The <strong>end-of-run modal</strong> renders a Prem-style
              figure: age pyramid, four setting-specific contact heatmaps,
              the effective combined matrix, and a bar chart of attack rate
              by age band.
            </li>
          </ul>
        </Section>

        {/* ====== REFERENCES ====== */}
        <div className="mt-10 pt-6 border-t border-gray-800">
          <h2 className="text-2xl font-semibold text-gray-100 mb-4">
            References
          </h2>
          <div className="space-y-3 text-sm text-gray-300">
            <Ref
              authors="Laosiritaworn Y, Laosiritaworn Y &amp; Laosiritaworn WS"
              year="2018"
              title="Herd immunity estimation of flu-like disease spreading in SEIR population: The sociophysics modelling via Monte Carlo simulation on discrete-spin model"
              venue="J. Phys.: Conf. Ser. 1144 012041"
              doi="10.1088/1742-6596/1144/1/012041"
              role="SEIR compartment structure and stochastic update inspiration."
            />
            <Ref
              authors="Prem K, Cook AR &amp; Jit M"
              year="2021"
              title="Projecting contact matrices in 177 geographical regions: an update and comparison with empirical data for the COVID-19 era"
              venue="PLOS Comp Biol 17(7):e1009098"
              doi="10.1371/journal.pcbi.1009098"
              role="Source of the Thailand age-stratified contact matrices for home, work, school, and other locations."
            />
            <Ref
              authors="Diekmann O, Heesterbeek JAP &amp; Roberts MG"
              year="2010"
              title="The construction of next-generation matrices for compartmental epidemic models"
              venue="J. R. Soc. Interface 7:873–885"
              doi="10.1098/rsif.2009.0386"
              role="NGM calibration of q from R₀ (§4 above)."
            />
            <Ref
              authors="Gillespie DT"
              year="2001"
              title="Approximate accelerated stochastic simulation of chemically reacting systems"
              venue="J. Chem. Phys. 115(4):1716–1733"
              doi="10.1063/1.1378322"
              role="Tau-leap Poisson sampling for new exposures (§5 above)."
            />
            <Ref
              authors="Kermack WO &amp; McKendrick AG"
              year="1927"
              title="A contribution to the mathematical theory of epidemics"
              venue="Proc. R. Soc. A 115(772):700–721"
              doi="10.1098/rspa.1927.0118"
              role="The SIR/SEIR ancestor everything compartmental descends from."
            />
            <Ref
              authors="UN DESA Population Division"
              year="2024"
              title="World Population Prospects — Thailand"
              venue="population.un.org/wpp"
              link="https://population.un.org/wpp/Download/Standard/Population/"
              role="Age-pyramid fractions (THAILAND_AGE_FRACTIONS)."
            />
            <Ref
              authors="Natural Earth"
              title="Admin 0 — countries (1:50m)"
              venue="naturalearthdata.com"
              link="https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/"
              role="Country outline (Thailand polygon, simplified to ~800 points)."
            />
          </div>
        </div>

        <div className="pt-8">
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

/* ---------- styling primitives ---------- */

function Section({
  title, icon, children,
}: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-lg font-semibold mb-2 text-gray-100 flex items-center
                     gap-2">
        {icon && <span aria-hidden>{icon}</span>}
        {title}
      </h2>
      <div className="text-sm text-gray-300 space-y-2">{children}</div>
    </section>
  );
}

function Subsection({
  title, icon, children,
}: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 pl-4 border-l-2 border-gray-800
                       hover:border-blue-700 transition-colors">
      <h3 className="text-base font-semibold mb-2 text-blue-300 flex items-center
                     gap-2">
        {icon && <span aria-hidden className="text-base">{icon}</span>}
        {title}
      </h3>
      <div className="text-sm text-gray-300 space-y-2">{children}</div>
    </section>
  );
}

/** Inline math span — slightly contrasted, monospace. */
function Math({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-blue-200 px-0.5">{children}</span>
  );
}

/** Display equation block. */
function Eq({ children }: { children: string }) {
  return (
    <pre className="bg-gray-900 border border-gray-800 rounded px-3 py-2
                   text-xs text-blue-100 font-mono leading-relaxed
                   whitespace-pre-wrap overflow-x-auto">
      {children}
    </pre>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300 underline"
    >
      {children}
    </a>
  );
}

function Glossary({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-4 gap-y-2
                  text-sm">
      {items.map(([term, def]) => (
        <div className="contents" key={term}>
          <dt className="font-mono text-gray-100">{term}</dt>
          <dd className="text-gray-300">{def}</dd>
        </div>
      ))}
    </dl>
  );
}

function Ref({
  authors, year, title, venue, doi, link, role,
}: {
  authors: string; year?: string; title: string; venue: string;
  doi?: string; link?: string; role?: string;
}) {
  return (
    <div className="border-l-2 border-gray-800 pl-3 py-1">
      <div>
        <span className="text-gray-100" dangerouslySetInnerHTML={{ __html: authors }} />
        {year && <span className="text-gray-400"> ({year})</span>}
        <span className="text-gray-400">. </span>
        <span className="italic">{title}</span>
        <span className="text-gray-400">. {venue}</span>
        {doi && (
          <>
            {" "}
            <ExtLink href={`https://doi.org/${doi}`}>doi:{doi}</ExtLink>
          </>
        )}
        {link && !doi && (
          <>
            {" "}
            <ExtLink href={link}>{link.replace(/^https?:\/\//, "")}</ExtLink>
          </>
        )}
      </div>
      {role && (
        <div className="text-xs text-gray-500 mt-0.5">→ {role}</div>
      )}
    </div>
  );
}
