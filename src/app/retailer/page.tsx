// Retailer-facing page: the business case for "Steal the Look, for Less".

export const metadata = { title: "Steal the Look, for Less: for retailers" };

export default function Retailer() {
  return (
    <main className="wide">
      <h1>Steal the Look, <em>for Less</em>: for retailers</h1>
      <p className="tagline">Turn inspiration photos into carts, with color matches you can prove.</p>

      <section className="panel" aria-labelledby="problem">
        <h2 id="problem">The problem</h2>
        <ul>
          <li>Shoppers find looks on social media and in campaigns, then guess which lipstick it is. Wrong guesses become returns or abandoned carts.</li>
          <li>&ldquo;Dupe&rdquo; claims are made from swatches, not from how a shade looks on a real face, so shoppers don&apos;t trust them.</li>
          <li>Try-on usually stops at &ldquo;here&apos;s a shade on you&rdquo;, with no way to say how close it is to the look the shopper wanted.</li>
        </ul>
      </section>

      <section className="panel" aria-labelledby="how">
        <h2 id="how">How it works</h2>
        <ol>
          <li><strong>Upload a look:</strong> YouCam Makeup Transfer shows it on the shopper&apos;s own face.</li>
          <li><strong>Find candidates:</strong> the look&apos;s lip color is measured and matched against your catalog.</li>
          <li><strong>Prove it on their face:</strong> YouCam Makeup Virtual Try-On applies each candidate; we measure the result against the look (CIEDE2000) and calibrate to the shopper&apos;s lips.</li>
          <li><strong>Recommend honestly:</strong> the best match at the lowest price, plus a clear flag when a &ldquo;dupe&rdquo; doesn&apos;t actually match on this face.</li>
        </ol>
      </section>

      <section className="panel" aria-labelledby="value">
        <h2 id="value">Why retailers use it</h2>
        <ul>
          <li><strong>Steer to your own brand with evidence:</strong> show that your lower-priced shade matches the premium one on the shopper&apos;s face.</li>
          <li><strong>Fewer shade-mismatch returns:</strong> shoppers see the match on themselves before buying.</li>
          <li><strong>Inspiration to cart in one flow:</strong> every recommendation has an Add to cart.</li>
        </ul>
        <p className="hint">Impact figures will be measured in pilot tests; none are claimed here yet.</p>
      </section>

      <section className="panel" aria-labelledby="embed">
        <h2 id="embed">Integration (planned)</h2>
        <p>Your catalog needs one color value per shade. A drop-in widget would look like this (placeholder, not yet built):</p>
        <pre><code>{`<script src="https://steal-the-look.example/embed.js"
        data-catalog="your-catalog-id" defer></script>`}</code></pre>
      </section>

      <footer><a href="/">Back to the shopper demo</a></footer>
    </main>
  );
}
