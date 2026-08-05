type Transform = (
  tagName: string,
  attribs: Record<string, string>,
) => {
  tagName: string;
  attribs: Record<string, string>;
};

const sanitizeHtml = Object.assign((value: string) => value, {
  simpleTransform:
    (tagName: string, attribs: Record<string, string>): Transform =>
    () => ({ tagName, attribs }),
});

export default sanitizeHtml;
