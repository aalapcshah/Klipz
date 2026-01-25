interface HighlightedTextProps {
  text: string;
  searchQuery: string;
}

export function HighlightedText({ text, searchQuery }: HighlightedTextProps) {
  if (!searchQuery || !text) {
    return <>{text}</>;
  }

  // Escape special regex characters in search query
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  try {
    // Create case-insensitive regex to find all matches
    const regex = new RegExp(`(${escapeRegex(searchQuery)})`, 'gi');
    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, index) => {
          // Check if this part matches the search query (case-insensitive)
          if (part.toLowerCase() === searchQuery.toLowerCase()) {
            return (
              <mark
                key={index}
                className="bg-yellow-300 dark:bg-yellow-600 text-foreground font-semibold px-0.5 rounded"
              >
                {part}
              </mark>
            );
          }
          return <span key={index}>{part}</span>;
        })}
      </>
    );
  } catch (error) {
    // If regex fails, return original text
    return <>{text}</>;
  }
}
