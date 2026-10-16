import { Fragment } from "react";

/** `code` spans and bare links inside a docs paragraph. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, index) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
          return <code key={index}>{part.slice(1, -1)}</code>;
        }
        return (
          <Fragment key={index}>
            {part.split(/(https?:\/\/[^\s)]+)/).map((piece, inner) =>
              /^https?:\/\//.test(piece) ? (
                <a key={inner} href={piece} target="_blank" rel="noreferrer">
                  {piece}
                </a>
              ) : (
                piece
              ),
            )}
          </Fragment>
        );
      })}
    </>
  );
}

export function CodeBlock({
  code,
  title,
  lang = "js",
}: {
  code: string;
  title?: string;
  lang?: string;
}) {
  return (
    <figure className="docs-code">
      {title && <figcaption>{title}</figcaption>}
      <pre>
        <code className={`language-${lang}`}>{code}</code>
      </pre>
    </figure>
  );
}
