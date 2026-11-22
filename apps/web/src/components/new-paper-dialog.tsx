import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUpIcon, GlobeIcon, PlusIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePreview } from "@/lib/preview";
import { trpc, trpcClient } from "@/lib/trpc";
import { uploadPaperFile } from "@/lib/upload";

type Source = "pdf" | "website";
type NewPaper =
  | { source: "pdf"; title: string; file: File | null }
  | { source: "website"; title: string; url: string };

/**
 * Adds a paper – a PDF (or a manual entry) or a website – into `folderId` when
 * given, otherwise into the library root. Opens the preview afterwards.
 */
export function NewPaperDialog({ folderId = null }: { folderId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source>("pdf");
  const queryClient = useQueryClient();
  const preview = usePreview();

  const create = useMutation({
    mutationFn: async (input: NewPaper) => {
      if (input.source === "website") {
        return trpcClient.paper.create.mutate({
          url: input.url,
          title: input.title || undefined,
          folderId,
        });
      }
      const paper = await trpcClient.paper.create.mutate({
        title: input.title,
        withFile: Boolean(input.file),
        folderId,
      });
      if (input.file) await uploadPaperFile(paper.id, input.file);
      return paper;
    },
    onSuccess: async (paper, input) => {
      await queryClient.invalidateQueries({ queryKey: trpc.paper.pathKey() });
      setOpen(false);
      toast.success(input.source === "website" ? "Website saved" : "Paper added");
      if (input.source === "website" || input.file) await preview.open(paper.id);
    },
    onError: (error) => toast.error(error.message),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();

    if (source === "website") {
      const url = String(form.get("url") ?? "").trim();
      if (!/^https?:\/\//i.test(url)) {
        toast.error("Please enter a URL starting with http:// or https://");
        return;
      }
      create.mutate({ source, url, title });
      return;
    }

    const file = form.get("file");
    const pdf = file instanceof File && file.size > 0 ? file : null;
    const pdfTitle = title || pdf?.name.replace(/\.pdf$/i, "") || "";
    if (!pdfTitle) {
      toast.error("Please enter a title or choose a PDF");
      return;
    }
    create.mutate({ source, title: pdfTitle, file: pdf });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon /> <span className="hidden @xl/main:inline">Add paper</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add to library</DialogTitle>
            <DialogDescription>
              Upload a PDF, create an entry manually or save a website.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={source} onValueChange={(value) => setSource(value as Source)}>
            <TabsList className="w-full">
              <TabsTrigger value="pdf">
                <FileUpIcon /> PDF
              </TabsTrigger>
              <TabsTrigger value="website">
                <GlobeIcon /> Website
              </TabsTrigger>
            </TabsList>
            <TabsContent value="pdf" className="grid gap-4 pt-2">
              <div className="grid gap-2">
                <Label htmlFor="file">PDF (optional)</Label>
                <Input id="file" name="file" type="file" accept="application/pdf" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" placeholder="Defaults to the file name" />
              </div>
            </TabsContent>
            <TabsContent value="website" className="grid gap-4 pt-2">
              <div className="grid gap-2">
                <Label htmlFor="url">URL</Label>
                <Input
                  id="url"
                  name="url"
                  type="url"
                  inputMode="url"
                  placeholder="https://…"
                  required={source === "website"}
                />
                <p className="text-xs text-muted-foreground">
                  Shuki saves a readable copy of the page. Links to PDFs are stored as PDF.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="website-title">Title (optional)</Label>
                <Input
                  id="website-title"
                  name="title"
                  placeholder="Taken from the page"
                  disabled={source !== "website"}
                />
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Adding…" : source === "website" ? "Save website" : "Add paper"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
