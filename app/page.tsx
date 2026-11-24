import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Ruler, Shapes, Sparkles } from "lucide-react";
import { SiteFooter } from "@/components/storefront/site-footer";
import { SiteHeader } from "@/components/storefront/site-header";

const paths = [
  {
    number: "01",
    icon: Shapes,
    title: "Furniture for everyday living",
    description: "Explore considered pieces for the rooms where life happens.",
    href: "#furniture",
    link: "Discover the collection",
  },
  {
    number: "02",
    icon: Ruler,
    title: "Made to fit your space",
    description: "Bring us a size, a sketch, or the start of an idea.",
    href: "#custom",
    link: "Talk about a custom piece",
  },
  {
    number: "03",
    icon: Sparkles,
    title: "A room, thoughtfully put together",
    description: "Find a starting point for a home that feels like yours.",
    href: "/interior-design",
    link: "Explore interior design",
  },
];

const principles = [
  {
    number: "01",
    title: "Start with your space",
    description: "Think about how a room works today and what would make it work better.",
  },
  {
    number: "02",
    title: "Choose what feels right",
    description: "Compare furniture, materials, and details at a pace that suits you.",
  },
  {
    number: "03",
    title: "Make it your own",
    description: "For a one-off idea or a whole room, tell us what you have in mind.",
  },
];

function LivingRoomIllustration({ titleId }: { titleId: string }) {
  return (
    <svg
      className="hero-illustration"
      viewBox="0 0 720 620"
      role="img"
      aria-labelledby={titleId}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id={titleId}>Illustration of a warm, modern living room</title>
      <rect width="720" height="620" fill="#e8dfd2" />
      <rect x="52" y="44" width="616" height="486" fill="#d9cbb9" />
      <rect x="101" y="93" width="212" height="222" fill="#b9c1b5" />
      <rect x="114" y="106" width="186" height="196" fill="#d8ded2" />
      <path d="M207 106v196M114 203h186" stroke="#b6b8a9" strokeWidth="8" />
      <rect x="346" y="112" width="235" height="192" rx="2" fill="#efe8de" />
      <path d="M381 273c25-51 49-77 79-77 25 0 39 20 52 38 13-24 33-46 62-54" fill="none" stroke="#8b765f" strokeWidth="5" />
      <circle cx="459" cy="159" r="15" fill="#b77b56" />
      <rect x="52" y="479" width="616" height="51" fill="#b89a7b" />
      <ellipse cx="378" cy="506" rx="234" ry="31" fill="#d1c0ab" />
      <rect x="191" y="359" width="337" height="121" rx="18" fill="#7a5944" />
      <rect x="169" y="336" width="382" height="102" rx="28" fill="#9b765b" />
      <rect x="202" y="353" width="148" height="74" rx="20" fill="#b18b6e" />
      <rect x="367" y="353" width="157" height="74" rx="20" fill="#ad8568" />
      <rect x="170" y="384" width="44" height="81" rx="16" fill="#89664f" />
      <rect x="507" y="384" width="44" height="81" rx="16" fill="#89664f" />
      <path d="M218 472v35M503 472v35" stroke="#493a2f" strokeWidth="11" strokeLinecap="round" />
      <rect x="387" y="453" width="154" height="15" rx="7" fill="#79583e" />
      <path d="M405 467v35M524 467v35" stroke="#624832" strokeWidth="8" strokeLinecap="round" />
      <circle cx="463" cy="435" r="10" fill="#dfc08a" />
      <rect x="92" y="370" width="37" height="108" rx="15" fill="#b57450" />
      <path d="M110 371c-28-36-34-56-24-78 23 10 36 30 34 62 4-40 18-62 43-71 8 33-2 59-39 87" fill="#65745e" />
      <path d="M94 404c-20-29-23-49-11-67 18 12 27 28 24 52 8-30 22-43 42-46 2 27-10 47-37 63" fill="#7b8a6e" />
      <rect x="609" y="377" width="19" height="102" rx="9" fill="#796248" />
      <path d="M582 382h74l-14-23h-46z" fill="#d1b78f" />
      <circle cx="619" cy="347" r="14" fill="#e0ccaa" />
    </svg>
  );
}

function InteriorIllustration() {
  return (
    <svg
      className="interior-illustration"
      viewBox="0 0 560 440"
      role="img"
      aria-labelledby="interior-title"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="interior-title">Illustration of a considered dining room interior</title>
      <rect width="560" height="440" fill="#c8cec1" />
      <rect x="36" y="34" width="488" height="334" fill="#e9e4d9" />
      <rect x="75" y="69" width="169" height="185" fill="#b6c1b3" />
      <rect x="87" y="81" width="145" height="161" fill="#d4ded2" />
      <path d="M159 81v161M87 161h145" stroke="#b3b9aa" strokeWidth="7" />
      <rect x="285" y="76" width="179" height="105" fill="#d2c4b3" />
      <path d="M308 157c19-36 40-53 65-53 20 0 37 13 53 29" fill="none" stroke="#8a755e" strokeWidth="4" />
      <rect x="72" y="315" width="416" height="53" fill="#a68a6a" />
      <ellipse cx="286" cy="331" rx="171" ry="20" fill="#d5c7b4" />
      <path d="M170 230h222l-20 24H190z" fill="#795b43" />
      <path d="M198 254v64M365 254v64" stroke="#684c38" strokeWidth="8" />
      <path d="M207 218v-51M278 218v-51M349 218v-51" stroke="#70543e" strokeWidth="5" />
      <path d="M193 170h28v47h-28zM264 170h28v47h-28zM335 170h28v47h-28z" fill="#9c7759" />
      <path d="M189 217h36v7h-36zM260 217h36v7h-36zM331 217h36v7h-36z" fill="#6b503a" />
      <path d="M443 311c-22-34-22-58-5-82 20 18 27 42 17 72 12-31 29-48 54-48 0 29-15 49-47 62" fill="#718068" />
      <rect x="459" y="303" width="31" height="28" rx="5" fill="#aa7655" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="storefront">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="announcement-bar">
        <span>Furniture, made for living</span>
        <span className="announcement-divider" aria-hidden="true">·</span>
        <a href="#approach">Thoughtful design, your way <ArrowUpRight size={13} aria-hidden="true" /></a>
      </div>

      <SiteHeader />

      <main id="main-content">
        <section className="hero-section" aria-labelledby="hero-heading">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" />Furniture &amp; interiors</p>
            <h1 id="hero-heading">Make room for <em>living.</em></h1>
            <p className="hero-description">
              Furniture and interior ideas shaped around your space, your routines, and the way you want home to feel.
            </p>
            <div className="hero-actions">
              <a className="button button-dark" href="#furniture">Explore furniture <ArrowRight size={16} aria-hidden="true" /></a>
              <a className="text-link" href="/interior-design">Discover interior design <ArrowUpRight size={15} aria-hidden="true" /></a>
            </div>
            <a className="hero-scroll" href="#ways-to-begin"><span>Scroll to explore</span><ArrowDown size={14} aria-hidden="true" /></a>
          </div>
          <div className="hero-art-wrap">
            <div className="hero-art-note"><span className="note-dot" />A little more you, in every room</div>
            <LivingRoomIllustration titleId="hero-living-room-title" />
            <div className="hero-art-caption"><span>01 / 03</span><span>Living, considered</span></div>
          </div>
          <div className="hero-index" aria-hidden="true">F—X&nbsp; / &nbsp;HOME</div>
        </section>

        <section className="intro-section section-wrap" id="ways-to-begin" aria-labelledby="intro-heading">
          <div className="intro-heading-block">
            <p className="eyebrow"><span className="eyebrow-line" />A good place to begin</p>
            <h2 id="intro-heading">Your home has its own rhythm.<br /><em>Let’s find its pieces.</em></h2>
          </div>
          <p className="intro-copy">From a single piece of furniture to a whole-room vision, find a starting point that feels right for you.</p>
        </section>

        <section className="path-section section-wrap" aria-label="Ways to explore Furni X">
          <div className="path-grid">
            {paths.map(({ number, icon: Icon, title, description, href, link }) => (
              <article className="path-card" key={number}>
                <div className="path-card-top"><span>{number}</span><Icon size={21} strokeWidth={1.5} aria-hidden="true" /></div>
                <h3>{title}</h3>
                <p>{description}</p>
                <a className="card-link" href={href}>{link}<ArrowRight size={15} aria-hidden="true" /></a>
              </article>
            ))}
          </div>
        </section>

        <section className="furniture-section" id="furniture" aria-labelledby="furniture-heading">
          <div className="furniture-art-panel"><LivingRoomIllustration titleId="furniture-living-room-title" /></div>
          <div className="furniture-copy-panel">
            <p className="eyebrow eyebrow-light"><span className="eyebrow-line" />Furniture</p>
            <h2 id="furniture-heading">Good design<br />feels like <em>home.</em></h2>
            <p>Find pieces for the moments that make a room yours: slow mornings, shared meals, a little corner to unwind.</p>
            <a className="button button-light" href="#approach">Get to know our approach <ArrowRight size={16} aria-hidden="true" /></a>
            <span className="section-mark" aria-hidden="true">FURNITURE / 01</span>
          </div>
        </section>

        <section className="interior-section section-wrap" id="interiors" aria-labelledby="interior-heading">
          <div className="interior-copy">
            <p className="eyebrow"><span className="eyebrow-line" />Interior design</p>
            <h2 id="interior-heading">A space that<br />feels like <em>you.</em></h2>
            <p>Bring together textures, light, and the details you love. Start with a reference, a room, or simply a feeling.</p>
            <a className="text-link" href="/interior-design/quote">Explore your design ideas <ArrowUpRight size={15} aria-hidden="true" /></a>
          </div>
          <div className="interior-art-wrap">
            <InteriorIllustration />
            <div className="interior-art-tag">A considered point of view <span>✳</span></div>
          </div>
        </section>

        <section className="custom-section" id="custom" aria-labelledby="custom-heading">
          <div className="custom-inner">
            <div className="custom-copy">
              <p className="eyebrow eyebrow-light"><span className="eyebrow-line" />Made for your space</p>
              <h2 id="custom-heading">Have something<br />specific <em>in mind?</em></h2>
              <p>Some ideas start with a sketch or a measurement. Tell us what you’re imagining and we’ll help you find a way forward.</p>
              <a className="button button-light" href="/custom-furniture">Start with an idea <ArrowRight size={16} aria-hidden="true" /></a>
            </div>
            <div className="custom-graphic" aria-hidden="true">
              <div className="custom-graphic-frame">
                <div className="custom-tabletop" />
                <div className="custom-table-leg custom-table-leg-left" />
                <div className="custom-table-leg custom-table-leg-right" />
                <div className="custom-vase"><span /></div>
                <div className="custom-measure measure-horizontal"><span>your width</span></div>
                <div className="custom-measure measure-vertical"><span>your height</span></div>
              </div>
              <span className="custom-graphic-label">An idea, taking shape</span>
            </div>
          </div>
        </section>

        <section className="approach-section section-wrap" id="approach" aria-labelledby="approach-heading">
          <div className="approach-intro">
            <p className="eyebrow"><span className="eyebrow-line" />The Furni X approach</p>
            <h2 id="approach-heading">Begin anywhere.<br /><em>Make it yours.</em></h2>
          </div>
          <div className="principle-list">
            {principles.map((principle) => (
              <article className="principle-row" key={principle.number}>
                <span className="principle-number">{principle.number}</span>
                <h3>{principle.title}</h3>
                <p>{principle.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="closing-section" aria-labelledby="closing-heading">
          <div className="closing-content">
            <p className="eyebrow eyebrow-light"><span className="eyebrow-line" />Furni X</p>
            <h2 id="closing-heading">Your next chapter<br />starts <em>at home.</em></h2>
            <a className="button button-light" href="#main-content">Back to the beginning <ArrowUpRight size={16} aria-hidden="true" /></a>
          </div>
          <div className="closing-sun" aria-hidden="true" />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
