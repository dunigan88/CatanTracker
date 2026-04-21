import Image from "next/image";

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center py-8">
      {/* Hero: text sits over the left ~62% of the logo so it lines up
          with the non-arrow portion of the image. */}
      <div className="w-full max-w-5xl">
        <h1
          className="font-extrabold tracking-tight leading-none text-[96px] md:text-[140px] text-left hero-title-in"
          style={{ width: "80%", marginLeft: "0", marginBottom: "-0.55em" }}
        >
          <span style={{ color: "#517d19" }}>catan</span>
          <span style={{ color: "#f0ad00" }}> tracker</span>
          <span style={{ color: "#4fa6eb" }}>.io</span>
        </h1>
        <div className="road-build">
          <Image
            src="/images/logo.png"
            alt="Catan Tracker"
            width={967}
            height={220}
            priority
            unoptimized
            className="w-full h-auto"
          />
        </div>
      </div>
    </div>
  );
}
