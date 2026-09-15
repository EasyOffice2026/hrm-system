/** Nexera logo (white artwork) — intended for dark backgrounds. */
export default function Logo({
  variant = "full",
  height = 40,
  className = "",
}: {
  variant?: "full" | "mark";
  height?: number;
  className?: string;
}) {
  return (
    <img
      src={variant === "full" ? "/logo-white.png" : "/logo-mark-white.png"}
      alt="Nexera Business Solutions"
      className={`object-contain ${className}`}
      style={{ height, width: "auto" }}
      draggable={false}
    />
  );
}
