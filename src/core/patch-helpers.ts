export function replaceExact(content: string, target: string, replacement: string, label: string): { content: string; changed: boolean } {
  if (content.includes(replacement)) {
    return { content, changed: false };
  }

  if (!content.includes(target)) {
    throw new Error(`Could not find patch target for ${label}`);
  }

  return {
    content: content.replace(target, replacement),
    changed: true
  };
}

export function replaceExactIfPresent(content: string, target: string, replacement: string): { content: string; changed: boolean } {
  if (content.includes(replacement)) {
    return { content, changed: false };
  }

  if (!content.includes(target)) {
    return { content, changed: false };
  }

  return {
    content: content.replace(target, replacement),
    changed: true
  };
}
