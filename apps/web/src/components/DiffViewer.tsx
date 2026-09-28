type DiffLineKind = "context" | "addition" | "deletion" | "hunk" | "meta";

type DiffLine = {
  text: string;
  kind: DiffLineKind;
  oldNumber: number | null;
  newNumber: number | null;
};

function parseDiff(diff: string) {
  let oldNumber = 0;
  let newNumber = 0;
  let additions = 0;
  let deletions = 0;
  let fileName = "changed-file.diff";

  const lines = diff.split("\n").map((text): DiffLine => {
    const hunk = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldNumber = Number(hunk[1]);
      newNumber = Number(hunk[2]);
      return { text, kind: "hunk", oldNumber: null, newNumber: null };
    }

    if (text.startsWith("+++ b/")) fileName = text.slice(6);
    if (text.startsWith("+") && !text.startsWith("+++")) {
      additions += 1;
      return { text, kind: "addition", oldNumber: null, newNumber: newNumber++ };
    }
    if (text.startsWith("-") && !text.startsWith("---")) {
      deletions += 1;
      return { text, kind: "deletion", oldNumber: oldNumber++, newNumber: null };
    }
    if (text.startsWith(" ")) {
      return { text, kind: "context", oldNumber: oldNumber++, newNumber: newNumber++ };
    }
    return { text, kind: "meta", oldNumber: null, newNumber: null };
  });

  return { lines, additions, deletions, fileName };
}

export function DiffViewer({ diff }: { diff: string }) {
  const parsed = parseDiff(diff);

  return (
    <section className="diff-viewer" aria-label="Diff preview">
      <div className="diff-toolbar">
        <div className="diff-file">
          <span className="diff-file-icon" aria-hidden="true">{"</>"}</span>
          <span className="diff-file-name">{parsed.fileName}</span>
        </div>
        <div className="diff-stats" aria-label="Change summary">
          <span className="diff-additions">+{parsed.additions}</span>
          <span className="diff-deletions">-{parsed.deletions}</span>
          <span className="diff-format">Unified diff</span>
        </div>
      </div>
      <div className="diff-code" role="region" aria-label={`Changes in ${parsed.fileName}`} tabIndex={0}>
        {diff ? parsed.lines.map((line, index) => (
          <div className={`diff-line diff-line-${line.kind}`} key={`${index}-${line.text}`}>
            <span className="diff-line-number">{line.oldNumber ?? ""}</span>
            <span className="diff-line-number">{line.newNumber ?? ""}</span>
            <span className="diff-line-content">{line.text || " "}</span>
          </div>
        )) : <p className="diff-empty">Select a pull request or paste a unified diff below.</p>}
      </div>
    </section>
  );
}