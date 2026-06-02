export function displayInitials(displayName: string | undefined | null): string {
  return (
    (displayName ?? "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?"
  );
}
