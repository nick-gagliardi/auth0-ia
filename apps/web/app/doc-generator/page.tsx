'use client';

import { useState } from 'react';
import { FileText, Loader2, Download, Copy, CheckCircle, GitPullRequest, ChevronDown, ChevronRight } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { recordActivity } from '@/hooks/use-activity-history';

interface GeneratedFile {
  path: string;
  title: string;
  content: string;
}

interface DocGenResult {
  structured: boolean;
  documentation?: string; // Fallback for unstructured
  featureSummary?: {
    what: string;
    who: string;
    why: string;
    keyConcepts: string[];
    prerequisites: string[];
    configurationSurfaces: string[];
    limitations: string;
  };
  relatedDocs?: Array<{
    path: string;
    relationship: string;
    action: string;
  }>;
  iaProposal?: {
    section: string;
    group: string;
    title: string;
    path: string;
    rationale: string;
  };
  documentationPlan?: Array<{
    type: string;
    title: string;
    rationale: string;
  }>;
  generatedFiles?: GeneratedFile[];
  docsToUpdate?: Array<{
    path: string;
    change: string;
    suggestion: string;
  }>;
  crossLinks?: Array<{
    fromPage: string;
    linkText: string;
    context: string;
  }>;
  navigationUpdate?: {
    section: string;
    jsonSnippet: string;
  };
  fileName: string;
  targetSite: string;
}

export default function DocGeneratorPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pmInput, setPmInput] = useState('');
  const [targetSite, setTargetSite] = useState<'main' | 'auth4genai'>('main');
  const [result, setResult] = useState<DocGenResult | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set());
  const [creatingPr, setCreatingPr] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
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
      setPrUrl(null);
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
    setPrUrl(null);

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

      setResult(data);

      // Record activity
      recordActivity({
        type: 'search',
        title: `Doc Generation: ${file.name}`,
        description: `Generated ${data.generatedFiles?.length || 0} documentation files for ${targetSite} site`,
        metadata: {
          fileName: file.name,
          targetSite,
          fileCount: data.generatedFiles?.length || 0,
        },
      });

      toast({
        title: 'Documentation generated',
        description: data.structured ? `Generated ${data.generatedFiles?.length || 0} documentation files` : 'Review the output below',
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

  const createPr = async () => {
    if (!result || !result.generatedFiles) return;

    setCreatingPr(true);

    try {
      const res = await fetch('/api/doc-generator/create-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSite: result.targetSite,
          generatedFiles: result.generatedFiles,
          navigationUpdate: result.navigationUpdate,
          featureSummary: result.featureSummary,
          docsToUpdate: result.docsToUpdate,
          crossLinks: result.crossLinks,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create PR');
      }

      setPrUrl(data.prUrl);
      toast({
        title: 'PR Created',
        description: `Pull request #${data.prNumber} created successfully`,
      });
    } catch (error: any) {
      toast({
        title: 'PR creation failed',
        description: error.message || 'Failed to create pull request',
        variant: 'destructive',
      });
    } finally {
      setCreatingPr(false);
    }
  };

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      title: 'Copied',
      description: 'Content copied to clipboard',
    });
  };

  const downloadFile = (filePath: string, content: string) => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Extract filename from path
    a.download = filePath.split('/').pop() || 'document.mdx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleFile = (idx: number) => {
    const next = new Set(expandedFiles);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setExpandedFiles(next);
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
              Upload your Product Requirements Document and provide additional context
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="prd-file">PRD File *</Label>
              <div className="flex gap-2">
                <Input
                  id="prd-file"
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={handleFileChange}
                  disabled={loading}
                  className="cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Supported: PDF (.pdf), Text (.txt), Markdown (.md). Word (.docx) coming soon.
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
                placeholder="Additional context, scope clarifications, or notes..."
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

        {/* Structured Results */}
        {result && result.structured && (
          <div className="space-y-4">
            {/* Feature Summary */}
            {result.featureSummary && (
              <Card>
                <CardHeader>
                  <CardTitle>Feature Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <span className="font-semibold">What:</span> {result.featureSummary.what}
                  </div>
                  <div>
                    <span className="font-semibold">Who:</span> {result.featureSummary.who}
                  </div>
                  <div>
                    <span className="font-semibold">Why:</span> {result.featureSummary.why}
                  </div>
                  {result.featureSummary.keyConcepts.length > 0 && (
                    <div>
                      <span className="font-semibold">Key Concepts:</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {result.featureSummary.keyConcepts.map((concept, i) => (
                          <Badge key={i} variant="outline">{concept}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* IA Proposal */}
            {result.iaProposal && (
              <Card>
                <CardHeader>
                  <CardTitle>Information Architecture Proposal</CardTitle>
                  <CardDescription>Suggested placement in documentation navigation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div><span className="font-semibold">Section:</span> {result.iaProposal.section}</div>
                  {result.iaProposal.group && (
                    <div><span className="font-semibold">Group:</span> {result.iaProposal.group}</div>
                  )}
                  <div><span className="font-semibold">Page Title:</span> {result.iaProposal.title}</div>
                  <div><span className="font-semibold">Path:</span> <code className="text-sm">{result.iaProposal.path}</code></div>
                  <div className="text-sm text-muted-foreground mt-2">{result.iaProposal.rationale}</div>
                </CardContent>
              </Card>
            )}

            {/* Generated Files */}
            {result.generatedFiles && result.generatedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Generated Documentation Files ({result.generatedFiles.length})</CardTitle>
                      <CardDescription>Complete .mdx files ready for PR</CardDescription>
                    </div>
                    {prUrl ? (
                      <Button asChild>
                        <a href={prUrl} target="_blank" rel="noreferrer">
                          <GitPullRequest className="w-4 h-4 mr-2" />
                          View PR
                        </a>
                      </Button>
                    ) : (
                      <Button onClick={createPr} disabled={creatingPr}>
                        {creatingPr ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Creating PR...
                          </>
                        ) : (
                          <>
                            <GitPullRequest className="w-4 h-4 mr-2" />
                            Create PR
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {result.generatedFiles.map((file, idx) => {
                      const isExpanded = expandedFiles.has(idx);
                      return (
                        <div key={idx} className="p-4">
                          <div
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => toggleFile(idx)}
                          >
                            <div className="flex items-center gap-2 flex-1">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              )}
                              <div>
                                <div className="font-medium">{file.title}</div>
                                <div className="text-sm text-muted-foreground font-mono">{file.path}</div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(file.content);
                                }}
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadFile(file.path, file.content);
                                }}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="mt-4 border rounded-lg p-4 bg-muted/50">
                              <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                                {file.content}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Docs to Update */}
            {result.docsToUpdate && result.docsToUpdate.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Existing Docs to Update</CardTitle>
                  <CardDescription>Suggested changes to existing documentation</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {result.docsToUpdate.map((update, idx) => (
                      <div key={idx} className="border-l-2 border-orange-500 pl-4 py-2">
                        <div className="font-mono text-sm text-orange-600 dark:text-orange-400">{update.path}</div>
                        <div className="text-sm mt-1">{update.change}</div>
                        {update.suggestion && (
                          <div className="text-xs text-muted-foreground mt-2 bg-muted p-2 rounded">
                            {update.suggestion}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Cross Links */}
            {result.crossLinks && result.crossLinks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Suggested Cross-Links</CardTitle>
                  <CardDescription>Pages that should link to the new documentation</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {result.crossLinks.map((link, idx) => (
                      <div key={idx} className="text-sm">
                        <span className="font-mono text-muted-foreground">{link.fromPage}</span>: {link.linkText}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Fallback: Unstructured Output */}
        {result && !result.structured && result.documentation && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Generated Documentation</CardTitle>
                  <CardDescription>Review and copy the generated content</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(result.documentation!)}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg p-4 max-h-[600px] overflow-y-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                  {result.documentation}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!result && !loading && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Upload a PRD file above to generate Auth0 documentation</p>
              <p className="text-xs mt-2">
                The AI will search related docs, propose navigation placement, and generate complete .mdx files
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
