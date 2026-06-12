export function stableRuntimeMetadataId(seed: string) {
  const hex = [0, 1, 2, 3]
    .map((salt) => hash32(`${salt}:${seed}`).toString(16).padStart(8, "0"))
    .join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function hash32(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
