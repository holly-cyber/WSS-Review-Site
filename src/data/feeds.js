// RSS / Atom sources for the News generator in the console (/console → News).
//
// Add or remove a feed by editing this array — each entry just needs a `name`
// and a feed `url`. `tag` is an optional grouping label shown in the console.
// The console fetches these through the rss-proxy Netlify function and shows a
// per-feed error if a URL is unreachable, so it's safe to experiment here.
export const feeds = [
  { name: "The Guardian — Sport", url: "https://www.theguardian.com/sport/rss", tag: "General" },
  { name: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml", tag: "General" },
  { name: "Women's Running", url: "https://www.womensrunning.com/feed/", tag: "Running" },
  { name: "Triathlete", url: "https://www.triathlete.com/feed/", tag: "Triathlon" },
];
