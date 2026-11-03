export function fill(template, vars) {
  if (typeof template !== "string") return "";
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key) || vars[key] == null) {
      throw new Error("Missing prompt value " + key);
    }
    return String(vars[key]);
  });
}
