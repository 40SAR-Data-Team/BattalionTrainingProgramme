import type { Event } from "../common/model";

/** Field prefixes usable in queries, e.g. `loc:stadium`, and the event fields they search. */
const FIELDS: Record<string, (e: Event) => (string | null)[]> = {
  cat: (e) => [e.category],
  loc: (e) => [e.loc],
  cond: (e) => [e.cond],
  resrc: (e) => [e.resrc],
  co: (e) => e.companies,
  title: (e) => [e.title],
};
/** Bare terms search the title, category and comments. */
const BARE = (e: Event) => [e.title, e.category, e.comments];

type Pred = (e: Event) => boolean;

/** Compiles a query (AND / OR / NOT, parentheses, "phrases", field:term; adjacency = AND) to a predicate; throws on syntax errors. */
export function compile(query: string): Pred {
  const tokens = query.match(/\(|\)|[^\s()"]+:"[^"]*"|"[^"]*"|[^\s()]+/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];

  const or = (): Pred => {
    let left = and();
    while (peek() === "OR") { i++; const l = left, r = and(); left = (e) => l(e) || r(e); }
    return left;
  };
  const and = (): Pred => {
    let left = not();
    while (peek() !== undefined && peek() !== "OR" && peek() !== ")") {
      if (peek() === "AND") i++;
      const l = left, r = not(); left = (e) => l(e) && r(e);
    }
    return left;
  };
  const not = (): Pred => {
    if (peek() === "NOT") { i++; const p = not(); return (e) => !p(e); }
    return primary();
  };
  const primary = (): Pred => {
    const tok = tokens[i++];
    if (tok === undefined || ["AND", "OR", ")"].includes(tok)) throw new Error(tok ? `Unexpected "${tok}"` : "Query ends too early");
    if (tok === "(") {
      const p = or();
      if (tokens[i++] !== ")") throw new Error('Missing ")"');
      return p;
    }
    const m = tok.match(/^(\w+):(.*)$/);
    const get = m && FIELDS[m[1].toLowerCase()];
    if (m && !get) throw new Error(`Unknown field "${m[1]}:" (use ${Object.keys(FIELDS).join(", ")})`);
    const needle = (get ? m![2] : tok).replace(/^"|"$/g, "").toLowerCase();
    const values = get ?? BARE;
    return (e) => values(e).some((v) => v?.toLowerCase().includes(needle));
  };

  if (!tokens.length) return () => true;
  const pred = or();
  if (i < tokens.length) throw new Error(`Unexpected "${tokens[i]}"`);
  return pred;
}
