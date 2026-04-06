export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-grey/30 bg-darkbg/60 p-8 shadow-lg">
        {children}
      </div>
    </div>
  );
}
