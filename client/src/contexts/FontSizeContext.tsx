import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type FontSize = "compact" | "standard" | "large";

interface FontSizeContextType {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
}

const FontSizeContext = createContext<FontSizeContextType | undefined>(undefined);

const FONT_SIZE_KEY = "metaclips-font-size-preference";

const fontSizeValues: Record<FontSize, string> = {
  compact: "clamp(14px, 0.875rem + 0.09375vw, 15px)",
  standard: "clamp(15px, 0.9375rem + 0.09375vw, 16px)",
  large: "clamp(17px, 1.0625rem + 0.09375vw, 18px)",
};

export function FontSizeProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    const saved = localStorage.getItem(FONT_SIZE_KEY);
    return (saved as FontSize) || "compact";
  });

  useEffect(() => {
    // Apply font size to document body
    document.body.style.fontSize = fontSizeValues[fontSize];
    localStorage.setItem(FONT_SIZE_KEY, fontSize);
  }, [fontSize]);

  const setFontSize = (size: FontSize) => {
    setFontSizeState(size);
  };

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize }}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize() {
  const context = useContext(FontSizeContext);
  if (!context) {
    throw new Error("useFontSize must be used within FontSizeProvider");
  }
  return context;
}
