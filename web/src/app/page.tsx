import Link from "next/link";

export default function Page() {
  return (
    <section className="space-y-3">
      <h1 className="font-display text-heading font-semibold text-text-primary">Compose</h1>
      <p className="max-w-prose text-small text-text-secondary">
        Write a prompt, see the pre-flight verdict, generate, and see what each guard said about the output. The compose form arrives in the next step; the{" "}
        <Link href="/history" className="text-accent-tertiary underline underline-offset-2">
          history
        </Link>{" "}
        already shows every outcome from the fixture.
      </p>
    </section>
  );
}
