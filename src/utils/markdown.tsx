/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

// Custom Markdown rendering processor that converts raw text into React nodes
export function renderMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];

  const lines = text.split('\n');
  const renderedNodes: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle Code Block Toggle
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // Close code block
        const blockText = codeBlockContent.join('\n');
        renderedNodes.push(
          <div key={`code-${i}`} className="w-full my-3 rounded-xl border border-zinc-200/50 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 font-mono text-xs overflow-x-auto relative select-none">
            {codeBlockLang && (
              <div className="absolute top-2.5 right-3 text-[9px] uppercase tracking-widest text-zinc-400 font-bold font-sans">
                {codeBlockLang}
              </div>
            )}
            <pre className="text-rose-500 dark:text-rose-400">{blockText}</pre>
          </div>
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        // Open code block
        inCodeBlock = true;
        codeBlockLang = line.trim().substring(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Headers
    if (line.startsWith('# ')) {
      renderedNodes.push(
        <h1 key={i} className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-zinc-50 mt-5 mb-2 leading-tight tracking-tight w-full text-center">
          {parseInlineElements(line.substring(2))}
        </h1>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      renderedNodes.push(
        <h2 key={i} className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-4 mb-2 leading-snug w-full text-center">
          {parseInlineElements(line.substring(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      renderedNodes.push(
        <h3 key={i} className="text-base sm:text-lg font-bold text-zinc-800 dark:text-zinc-200 mt-3.5 mb-1.5 w-full text-center">
          {parseInlineElements(line.substring(4))}
        </h3>
      );
      continue;
    }

    // Quotes
    if (line.startsWith('> ')) {
      renderedNodes.push(
        <blockquote key={i} className="w-full border-l-4 border-indigo-500 bg-zinc-50/50 dark:bg-zinc-900/30 pl-4 py-2 my-3 rounded-r-xl italic text-xs leading-relaxed text-zinc-500 dark:text-zinc-400 text-left">
          {parseInlineElements(line.substring(2))}
        </blockquote>
      );
      continue;
    }

    // Bullet points
    if (line.startsWith('- ') || line.startsWith('* ')) {
      renderedNodes.push(
        <div key={i} className="w-full flex items-start justify-center gap-2.5 my-1 text-left px-4">
          <span className="text-indigo-500 dark:text-indigo-400 mt-1.5 text-xs font-bold">•</span>
          <span className="text-sm sm:text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            {parseInlineElements(line.substring(2))}
          </span>
        </div>
      );
      continue;
    }

    // Paragraph (default)
    if (line.trim() === '') {
      renderedNodes.push(<div key={i} className="h-2" />);
    } else {
      renderedNodes.push(
        <p key={i} className="text-sm sm:text-base leading-relaxed text-zinc-750 dark:text-zinc-300 py-1 text-center w-full whitespace-pre-wrap select-none">
          {parseInlineElements(line)}
        </p>
      );
    }
  }

  return renderedNodes;
}

// Sub-parser to process Bold, Italic, and Inline Code blocks in a single text line
function parseInlineElements(text: string): React.ReactNode[] {
  let nodes: React.ReactNode[] = [text];

  // 1. Process Bold: **text**
  nodes = nodes.flatMap((node) => {
    if (typeof node !== 'string') return node;
    const regex = /\*\*(.*?)\*\*/g;
    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(node)) !== null) {
      if (match.index > lastIndex) {
        result.push(node.substring(lastIndex, match.index));
      }
      result.push(
        <strong key={match.index} className="font-extrabold text-zinc-900 dark:text-white">
          {match[1]}
        </strong>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < node.length) {
      result.push(node.substring(lastIndex));
    }
    return result;
  });

  // 2. Process Italics: *text*
  nodes = nodes.flatMap((node) => {
    if (typeof node !== 'string') return node;
    const regex = /\*(.*?)\*/g;
    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(node)) !== null) {
      if (match.index > lastIndex) {
        result.push(node.substring(lastIndex, match.index));
      }
      result.push(
        <em key={match.index} className="italic text-zinc-800 dark:text-zinc-200">
          {match[1]}
        </em>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < node.length) {
      result.push(node.substring(lastIndex));
    }
    return result;
  });

  // 3. Process Inline Code: `code`
  nodes = nodes.flatMap((node) => {
    if (typeof node !== 'string') return node;
    const regex = /`(.*?)`/g;
    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(node)) !== null) {
      if (match.index > lastIndex) {
        result.push(node.substring(lastIndex, match.index));
      }
      result.push(
        <code key={match.index} className="px-1.5 py-0.5 font-mono text-xs rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/40 dark:border-zinc-700/40 text-rose-500 dark:text-rose-400 select-none">
          {match[1]}
        </code>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < node.length) {
      result.push(node.substring(lastIndex));
    }
    return result;
  });

  return nodes;
}
