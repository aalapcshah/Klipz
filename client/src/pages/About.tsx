import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-8">About MetaClips</h1>

        <div className="prose prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mb-4">Our Mission</h2>
            <p className="text-muted-foreground">
              MetaClips is an AI-powered media management platform designed to help individuals and teams organize,
              enrich, and export their visual content efficiently. We believe that managing media shouldn't be a
              time-consuming task, so we've built intelligent tools that automate the tedious work and let you focus
              on what matters most.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">What We Do</h2>
            <p className="text-muted-foreground">
              Our platform combines advanced AI technology with intuitive user interfaces to provide:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>Intelligent file organization and tagging</li>
              <li>AI-powered content enrichment and metadata extraction</li>
              <li>Powerful search and filtering capabilities</li>
              <li>Flexible export options for various workflows</li>
              <li>Collaboration tools for teams</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Our Values</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Privacy First</h3>
                <p className="text-sm text-muted-foreground">
                  Your data belongs to you. We're committed to protecting your privacy and giving you full control
                  over your content.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Innovation</h3>
                <p className="text-sm text-muted-foreground">
                  We continuously improve our AI models and features to provide the best possible experience.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Simplicity</h3>
                <p className="text-sm text-muted-foreground">
                  Complex technology should feel simple. We design interfaces that anyone can use.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Reliability</h3>
                <p className="text-sm text-muted-foreground">
                  Your media is important. We ensure it's always accessible, secure, and backed up.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Get in Touch</h2>
            <p className="text-muted-foreground">
              Have questions or feedback? We'd love to hear from you.{" "}
              <Link href="/contact" className="text-primary hover:underline">
                Contact us
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
