let seq = 0;
const key = () => `k${++seq}`;

export function para(text, style = "normal") {
  return {
    _type: "block",
    _key: key(),
    style,
    markDefs: [],
    children: [{ _type: "span", _key: key(), text, marks: [] }],
  };
}

export function heading(text, level) {
  return para(text, level === 3 ? "h3" : "h2");
}

export function blocks(...paragraphs) {
  return paragraphs.map((p) => (typeof p === "string" ? para(p) : p));
}
