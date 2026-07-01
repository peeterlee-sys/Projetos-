import Image from "next/image";

export function RuahLogo({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/logo-ruah.png"
      alt="Ruah"
      width={802}
      height={161}
      priority
      className={`h-8 w-auto ${className}`}
    />
  );
}
