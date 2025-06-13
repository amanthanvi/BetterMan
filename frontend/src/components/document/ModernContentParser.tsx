import React from "react";
import { motion } from "framer-motion";
import {
  CodeIcon,
  CopyIcon,
  CheckIcon,
  ChevronRightIcon,
  InfoCircledIcon,
  RocketIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  DotFilledIcon,
} from "@radix-ui/react-icons";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/cn";
import type { Document } from "@/types";

interface DocumentSection {
  id: string;
  title: string;
  content: string;
  level: number;
  type?: string;
}

interface RenderOptions {
  darkMode: boolean;
  fontSize: "sm" | "base" | "lg";
  viewMode: "comfortable" | "compact" | "spacious";
  onCopy: (text: string) => void;
}

export class ModernContentParser {
  private sectionTypePatterns = {
    header: /^[A-Z]+\(\d+\)/i,
    synopsis: /^(SYNOPSIS|SYNTAX)/i,
    description: /^DESCRIPTION/i,
    options: /^OPTIONS?/i,
    examples: /^EXAMPLES?/i,
    "exit status": /^EXIT\s+STATUS/i,
    environment: /^ENVIRONMENT/i,
    notes: /^NOTES?/i,
    bugs: /^BUGS?/i,
    author: /^AUTHOR/i,
    copyright: /^COPYRIGHT/i,
    "see also": /^SEE\s+ALSO/i,
  };

  parseDocument(document: Document): DocumentSection[] {
    const sections: DocumentSection[] = [];
    
    // Parse from sections if available
    if (document.sections && document.sections.length > 0) {
      document.sections.forEach((section, index) => {
        const type = this.detectSectionType(section.name);
        sections.push({
          id: `section-${section.name.toLowerCase().replace(/\s+/g, "-")}`,
          title: section.name,
          content: section.content,
          level: 2,
          type,
        });

        // Parse subsections
        if (section.subsections) {
          section.subsections.forEach((subsection, subIndex) => {
            sections.push({
              id: `section-${section.name.toLowerCase().replace(/\s+/g, "-")}-sub-${subIndex}`,
              title: subsection.name,
              content: subsection.content,
              level: 3,
              type: "subsection",
            });
          });
        }
      });
    } 
    // Fallback to raw content or content field
    else if (document.raw_content || document.content) {
      const content = document.raw_content || document.content || "";
      const parsedSections = this.parseRawContent(content);
      sections.push(...parsedSections);
    }

    return sections;
  }

  private parseRawContent(content: string): DocumentSection[] {
    const sections: DocumentSection[] = [];
    const lines = content.split("\n");
    
    let currentSection: DocumentSection | null = null;
    let sectionContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Check if this is a section header
      if (this.isSectionHeader(trimmedLine)) {
        // Save previous section
        if (currentSection) {
          currentSection.content = this.cleanContent(sectionContent.join("\n"));
          sections.push(currentSection);
          sectionContent = [];
        }

        // Create new section
        const type = this.detectSectionType(trimmedLine);
        currentSection = {
          id: `section-${trimmedLine.toLowerCase().replace(/\s+/g, "-")}`,
          title: trimmedLine,
          content: "",
          level: 2,
          type,
        };
      } else if (currentSection) {
        sectionContent.push(line);
      }
    }

    // Save last section
    if (currentSection) {
      currentSection.content = this.cleanContent(sectionContent.join("\n"));
      sections.push(currentSection);
    }

    return sections;
  }

  private isSectionHeader(line: string): boolean {
    // Check if line is all caps or matches known section patterns
    return /^[A-Z\s]+$/.test(line) && line.length > 2 && line.length < 50;
  }

  private detectSectionType(title: string): string {
    for (const [type, pattern] of Object.entries(this.sectionTypePatterns)) {
      if (pattern.test(title)) {
        return type;
      }
    }
    return "general";
  }

  private cleanContent(content: string): string {
    return content
      .replace(/\x1b\[[0-9;]*m/g, "") // Remove ANSI escape codes
      .replace(/\s+\n/g, "\n") // Remove trailing spaces
      .replace(/\n{3,}/g, "\n\n") // Limit consecutive newlines
      .trim();
  }

  renderSection(section: DocumentSection, options: RenderOptions): React.ReactNode {
    switch (section.type) {
      case "header":
        return this.renderHeader(section, options);
      case "synopsis":
        return this.renderSynopsis(section, options);
      case "description":
        return this.renderDescription(section, options);
      case "options":
        return this.renderOptions(section, options);
      case "examples":
        return this.renderExamples(section, options);
      case "see also":
        return this.renderSeeAlso(section, options);
      default:
        return this.renderGenericSection(section, options);
    }
  }

  private renderHeader(section: DocumentSection, options: RenderOptions): React.ReactNode {
    return (
      <div className="mb-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-8 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-2xl"
        >
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {section.content}
          </h1>
        </motion.div>
      </div>
    );
  }

  private renderSynopsis(section: DocumentSection, options: RenderOptions): React.ReactNode {
    const lines = section.content.split("\n").filter(Boolean);
    
    return (
      <Card className="p-6 bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-950 dark:to-gray-900 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <CodeIcon className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-semibold">{section.title}</h2>
          </div>
          
          <div className="space-y-3">
            {lines.map((line, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="font-mono text-sm bg-black/30 px-4 py-3 rounded-lg border border-gray-700 hover:border-blue-500/50 transition-colors group"
              >
                <code className="text-blue-300">{this.formatCommand(line)}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => options.onCopy(line)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity float-right -mt-1"
                >
                  <CopyIcon className="w-4 h-4" />
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  private renderDescription(section: DocumentSection, options: RenderOptions): React.ReactNode {
    const paragraphs = section.content.split("\n\n").filter(Boolean);
    
    return (
      <div className="prose prose-gray dark:prose-invert max-w-none">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <InfoCircledIcon className="w-6 h-6 text-blue-500" />
          {section.title}
        </h2>
        
        <div className="space-y-4">
          {paragraphs.map((paragraph, index) => (
            <motion.p
              key={index}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.1 }}
              className="text-gray-700 dark:text-gray-300 leading-relaxed"
            >
              {this.formatParagraph(paragraph)}
            </motion.p>
          ))}
        </div>
      </div>
    );
  }

  private renderOptions(section: DocumentSection, options: RenderOptions): React.ReactNode {
    const optionBlocks = this.parseOptions(section.content);
    
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <CodeIcon className="w-6 h-6 text-green-500" />
          {section.title}
        </h2>
        
        <div className="space-y-4">
          {optionBlocks.map((option, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ x: 4 }}
            >
              <Card className="p-5 hover:shadow-lg transition-all duration-200 border-l-4 border-green-500">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                      <ChevronRightIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                  
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {option.flags.map((flag, flagIndex) => (
                        <Badge
                          key={flagIndex}
                          variant="secondary"
                          className="font-mono text-sm bg-gray-100 dark:bg-gray-800"
                        >
                          {flag}
                        </Badge>
                      ))}
                    </div>
                    
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                      {option.description}
                    </p>

                    {option.example && (
                      <div className="mt-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                        <code className="text-sm text-blue-600 dark:text-blue-400">
                          Example: {option.example}
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  private renderExamples(section: DocumentSection, options: RenderOptions): React.ReactNode {
    const examples = this.parseExamples(section.content);
    
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <RocketIcon className="w-6 h-6 text-purple-500" />
          {section.title}
        </h2>
        
        <div className="space-y-6">
          {examples.map((example, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="overflow-hidden bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20">
                <div className="p-6">
                  {example.title && (
                    <h3 className="text-lg font-semibold mb-3 text-purple-900 dark:text-purple-200">
                      {example.title}
                    </h3>
                  )}
                  
                  {example.description && (
                    <p className="text-gray-700 dark:text-gray-300 mb-4">
                      {example.description}
                    </p>
                  )}
                  
                  <div className="relative">
                    <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                      <code className="text-sm">{example.code}</code>
                    </pre>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => options.onCopy(example.code)}
                      className="absolute top-2 right-2 bg-gray-800 hover:bg-gray-700 text-white"
                    >
                      <CopyIcon className="w-4 h-4" />
                    </Button>
                  </div>

                  {example.output && (
                    <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                        Output:
                      </p>
                      <pre className="text-sm text-gray-800 dark:text-gray-200">
                        {example.output}
                      </pre>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  private renderSeeAlso(section: DocumentSection, options: RenderOptions): React.ReactNode {
    const links = this.parseSeeAlso(section.content);
    
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <ArrowRightIcon className="w-6 h-6 text-indigo-500" />
          {section.title}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {links.map((link, index) => (
            <motion.a
              key={index}
              href={`/docs/${link.command}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.02 }}
              className="block"
            >
              <Card className="p-4 hover:shadow-md transition-all duration-200 border-2 border-transparent hover:border-indigo-500">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
                    <DotFilledIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {link.command}
                    </h3>
                    {link.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {link.description}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            </motion.a>
          ))}
        </div>
      </div>
    );
  }

  private renderGenericSection(section: DocumentSection, options: RenderOptions): React.ReactNode {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          {section.title}
        </h2>
        
        <div className="prose prose-gray dark:prose-invert max-w-none">
          {this.formatContent(section.content, options)}
        </div>
      </div>
    );
  }

  private formatContent(content: string, options: RenderOptions): React.ReactNode {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    
    let currentBlock: string[] = [];
    let blockType: "code" | "text" = "text";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect code blocks
      if (line.match(/^\s{4,}/) || line.match(/^```/)) {
        if (blockType === "text" && currentBlock.length > 0) {
          elements.push(
            <p key={`text-${i}`} className="text-gray-700 dark:text-gray-300 mb-4">
              {currentBlock.join(" ")}
            </p>
          );
          currentBlock = [];
        }
        blockType = "code";
        currentBlock.push(line);
      } else if (blockType === "code" && currentBlock.length > 0) {
        elements.push(
          <pre key={`code-${i}`} className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto mb-4">
            <code className="text-sm">{currentBlock.join("\n")}</code>
          </pre>
        );
        currentBlock = [];
        blockType = "text";
        if (line.trim()) currentBlock.push(line);
      } else if (line.trim()) {
        currentBlock.push(line);
      } else if (currentBlock.length > 0) {
        elements.push(
          <p key={`text-${i}`} className="text-gray-700 dark:text-gray-300 mb-4">
            {currentBlock.join(" ")}
          </p>
        );
        currentBlock = [];
      }
    }

    // Handle remaining content
    if (currentBlock.length > 0) {
      if (blockType === "code") {
        elements.push(
          <pre key="code-final" className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto">
            <code className="text-sm">{currentBlock.join("\n")}</code>
          </pre>
        );
      } else {
        elements.push(
          <p key="text-final" className="text-gray-700 dark:text-gray-300">
            {currentBlock.join(" ")}
          </p>
        );
      }
    }

    return <>{elements}</>;
  }

  private formatCommand(command: string): string {
    // Highlight command parts
    return command
      .replace(/\[([^\]]+)\]/g, '<span class="text-yellow-400">[$1]</span>')
      .replace(/\{([^}]+)\}/g, '<span class="text-green-400">{$1}</span>')
      .replace(/--?[\w-]+/g, (match) => `<span class="text-purple-400">${match}</span>`);
  }

  private formatParagraph(text: string): string {
    // Format inline code and emphasis
    return text
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }

  private parseOptions(content: string): Array<{
    flags: string[];
    description: string;
    example?: string;
  }> {
    const options: Array<{ flags: string[]; description: string; example?: string }> = [];
    const lines = content.split("\n");
    
    let currentOption: { flags: string[]; description: string; example?: string } | null = null;
    let descriptionLines: string[] = [];

    for (const line of lines) {
      // Check if this is an option line (starts with -, --, or single letter followed by comma)
      if (line.match(/^\s*(-[\w-]+(?:\s*,\s*-[\w-]+)*)/)) {
        // Save previous option
        if (currentOption) {
          currentOption.description = descriptionLines.join(" ").trim();
          options.push(currentOption);
          descriptionLines = [];
        }

        // Parse new option
        const flagMatch = line.match(/(-[\w-]+(?:\s*,\s*-[\w-]+)*)/);
        if (flagMatch) {
          const flags = flagMatch[1].split(/\s*,\s*/);
          currentOption = { flags, description: "" };
          
          // Get description from the same line if present
          const descStart = line.indexOf(flagMatch[0]) + flagMatch[0].length;
          const desc = line.substring(descStart).trim();
          if (desc) descriptionLines.push(desc);
        }
      } else if (currentOption && line.trim()) {
        // Continue building description
        descriptionLines.push(line.trim());
      }
    }

    // Save last option
    if (currentOption) {
      currentOption.description = descriptionLines.join(" ").trim();
      options.push(currentOption);
    }

    return options;
  }

  private parseExamples(content: string): Array<{
    title?: string;
    description?: string;
    code: string;
    output?: string;
  }> {
    const examples: Array<{ title?: string; description?: string; code: string; output?: string }> = [];
    const blocks = content.split(/\n\n+/);
    
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      
      // Check if this looks like a command example
      if (block.includes("$") || block.includes("#") || block.match(/^\s*\w+\s+/)) {
        const example: any = { code: block.trim() };
        
        // Check if previous block might be description
        if (i > 0 && !blocks[i - 1].includes("$") && !blocks[i - 1].includes("#")) {
          example.description = blocks[i - 1].trim();
        }
        
        // Check if next block might be output
        if (i < blocks.length - 1 && !blocks[i + 1].includes("$") && !blocks[i + 1].includes("#")) {
          example.output = blocks[i + 1].trim();
          i++; // Skip the output block
        }
        
        examples.push(example);
      }
    }

    return examples;
  }

  private parseSeeAlso(content: string): Array<{ command: string; description?: string }> {
    const links: Array<{ command: string; description?: string }> = [];
    
    // Match patterns like: command(section), command (section)
    const matches = content.matchAll(/(\w+)\s*\((\d+)\)/g);
    
    for (const match of matches) {
      links.push({
        command: `${match[1]}.${match[2]}`,
        description: `Section ${match[2]}`,
      });
    }

    return links;
  }
}