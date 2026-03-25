'use client';

import { useState } from 'react';
import { FileText, Loader2, Download, Copy, CheckCircle } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { recordActivity } from '@/hooks/use-activity-history';

export default function DocGeneratorPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pmInput, setPmInput] = useState('');
  const [targetSite, setTargetSite] = useState<'main' | 'auth4genai'>('main');
  const [result, setResult] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Check file type
      const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown'];
      if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.md')) {
        toast({
          title: 'Invalid file type',
          description: 'Please upload a PDF, Word document, text, or markdown file',
          variant: 'destructive',
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const generateDocs = async () => {
    if (!file) {
      toast({
        title: 'No file selected',
        description: 'Please upload a PRD file',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('pmInput', pmInput);
      formData.append('targetSite', targetSite);

      const res = await fetch('/api/doc-generator', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate documentation');
      }

      setResult(data.documentation);

      // Record activity
      recordActivity({
        type: 'search',
        title: `Doc Generation: ${file.name}`,
        description: `Generated documentation for ${targetSite} site`,
        metadata: {
          fileName: file.name,
          targetSite,
        },
      });

      toast({
        title: 'Documentation generated',
        description: 'Review the output below',
      });
    } catch (error: any) {
      toast({
        title: 'Generation failed',
        description: error.message || 'Failed to generate documentation',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      toast({
        title: 'Copied',
        description: 'Documentation copied to clipboard',
      });
    }
  };

  const downloadMarkdown = () => {
    if (result) {
      const blob = new Blob([result], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `auth0-docs-${Date.now()}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
            <FileText className="w-8 h-8" />
            Doc Generator
          </h1>
          <p className="text-muted-foreground">
            Generate Auth0 documentation from Product Requirements Documents
          </p>
        </div>

        {/* Input Card */}
        <Card>
          <CardHeader>
            <CardTitle>Upload PRD & Configure</CardTitle>
            <CardDescription>
              Upload your Product Requirements Document and provide additional context to generate complete, publication-ready Auth0 documentation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="prd-file">PRD File *</Label>
              <Input
                id="prd-file"
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={handleFileChange}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Supported formats: PDF, Word (.docx), Text (.txt), Markdown (.md)
              </p>
              {file && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>

            {/* PM Input */}
            <div className="space-y-2">
              <Label htmlFor="pm-input">PM Input (Optional)</Label>
              <Textarea
                id="pm-input"
                value={pmInput}
                onChange={(e) => setPmInput(e.target.value)}
                placeholder="Additional context, scope clarifications, or notes from the Product Manager..."
                rows={4}
                disabled={loading}
              />
            </div>

            {/* Target Site */}
            <div className="space-y-2">
              <Label>Target Documentation Site</Label>
              <RadioGroup value={targetSite} onValueChange={(v) => setTargetSite(v as 'main' | 'auth4genai')} disabled={loading}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="main" id="main" />
                  <Label htmlFor="main" className="font-normal">
                    Main site (auth0.com/docs)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="auth4genai" id="auth4genai" />
                  <Label htmlFor="auth4genai" className="font-normal">
                    Auth4GenAI site (auth0.com/ai/docs)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Generate Button */}
            <Button onClick={generateDocs} disabled={loading || !file} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating Documentation...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Generate Documentation
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Generated Documentation</CardTitle>
                  <CardDescription>
                    Review the documentation set below. Use the actions to copy or download.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyToClipboard}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadMarkdown}>
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="formatted">
                <TabsList>
                  <TabsTrigger value="formatted">Formatted</TabsTrigger>
                  <TabsTrigger value="raw">Raw Markdown</TabsTrigger>
                </TabsList>
                <TabsContent value="formatted" className="mt-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none border rounded-lg p-6 max-h-[600px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {result}
                    </pre>
                  </div>
                </TabsContent>
                <TabsContent value="raw" className="mt-4">
                  <div className="border rounded-lg p-4 max-h-[600px] overflow-y-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                      {result}
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {!result && !loading && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Upload a PRD file above to generate Auth0 documentation</p>
              <p className="text-xs mt-2">
                The AI will analyze your PRD and generate a complete documentation set following the Auth0 style guide
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
