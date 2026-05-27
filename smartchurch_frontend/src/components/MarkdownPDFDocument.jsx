import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const PAGE_WIDTH = 595.28;
const H_PADDING = 45;
const CONTENT_WIDTH = PAGE_WIDTH - H_PADDING * 2;
const IMAGE_BOX_HEIGHT = 220;

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 45,
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#1e293b',
  },
  h1: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 8, marginTop: 12, color: '#0f172a' },
  h2: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 6, marginTop: 10, color: '#1e293b' },
  h3: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 5, marginTop: 8, color: '#334155' },
  h4: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 4, marginTop: 6 },
  h5: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 4, marginTop: 5 },
  paragraph: { fontSize: 11, lineHeight: 1.65, marginBottom: 7, color: '#334155' },
  bold: { fontFamily: 'Helvetica-Bold' },
  italic: { fontFamily: 'Helvetica-Oblique' },
  code: { fontFamily: 'Courier', fontSize: 10 },
  codeBlock: { backgroundColor: '#f1f5f9', padding: 8, marginBottom: 8 },
  codeBlockText: { fontFamily: 'Courier', fontSize: 9.5, color: '#334155' },
  blockquote: { borderLeftWidth: 3, borderLeftColor: '#6366f1', paddingLeft: 10, marginBottom: 8 },
  list: { marginBottom: 7 },
  listItem: { flexDirection: 'row', marginBottom: 3 },
  bullet: { width: 15, fontSize: 11, color: '#64748b' },
  listText: { flex: 1, fontSize: 11, lineHeight: 1.5, color: '#334155' },
  listItemText: { fontSize: 11, lineHeight: 1.5, color: '#334155', marginBottom: 3 },
  hr: { borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginVertical: 10 },
  imageBlock: { marginBottom: 8 },
  imageWrapper: {
    width: CONTENT_WIDTH,
    height: IMAGE_BOX_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  image: {
    width: CONTENT_WIDTH,
    height: IMAGE_BOX_HEIGHT,
    objectFit: 'contain',
  },
  imageCaption: { fontSize: 9, color: '#94a3b8', textAlign: 'center', marginBottom: 8 },
  table: { marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  tableRow: { flexDirection: 'row' },
  tableHeaderCell: {
    flex: 1, padding: 5, fontSize: 10, fontFamily: 'Helvetica-Bold',
    color: '#1e293b', borderRightWidth: 1, borderRightColor: '#e2e8f0',
    backgroundColor: '#f1f5f9',
  },
  tableCell: {
    flex: 1, padding: 5, fontSize: 10, color: '#334155',
    borderRightWidth: 1, borderRightColor: '#e2e8f0',
    borderTopWidth: 1, borderTopColor: '#e2e8f0',
  },
  link: { color: '#6366f1' },
  listItemContent: { flex: 1 },
});

function wrapStrings(children, textStyle) {
  return React.Children.map(children, (child) =>
    typeof child === 'string' && child.trim()
      ? <Text style={textStyle}>{child}</Text>
      : child
  );
}

function isImageOnlyParagraph(node) {
  return node?.children?.length
    ? node.children.every(
        (child) => child.type === 'element' && child.tagName === 'img'
      )
    : false;
}

function extractTextFromNode(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (!node.children?.length) return '';
  return node.children.map((child) => extractTextFromNode(child)).join('');
}

const components = {
  h1: ({ children }) => <Text style={styles.h1}>{children}</Text>,
  h2: ({ children }) => <Text style={styles.h2}>{children}</Text>,
  h3: ({ children }) => <Text style={styles.h3}>{children}</Text>,
  h4: ({ children }) => <Text style={styles.h4}>{children}</Text>,
  h5: ({ children }) => <Text style={styles.h5}>{children}</Text>,
  h6: ({ children }) => <Text style={styles.h5}>{children}</Text>,
  p: ({ children, node }) => (
    isImageOnlyParagraph(node)
      ? <View style={styles.imageBlock}>{children}</View>
      : <Text style={styles.paragraph}>{children}</Text>
  ),
  strong: ({ children }) => <Text style={styles.bold}>{children}</Text>,
  em:     ({ children }) => <Text style={styles.italic}>{children}</Text>,
  del:    ({ children }) => <Text>{children}</Text>,
  a:      ({ children }) => <Text style={styles.link}>{children}</Text>,
  span:   ({ children }) => <Text>{children}</Text>,
  br:     () => <Text>{'\n'}</Text>,
  hr:     () => <View style={styles.hr} />,
  pre:    ({ children }) => <View style={styles.codeBlock}>{children}</View>,
  code:   ({ className, children }) => (
    <Text style={className ? styles.codeBlockText : styles.code}>{children}</Text>
  ),
  blockquote: ({ children }) => (
    <View style={styles.blockquote}>
      {wrapStrings(children, styles.paragraph)}
    </View>
  ),
  ul: ({ children }) => <View style={styles.list}>{children}</View>,
  ol: ({ children }) => <View style={styles.list}>{children}</View>,
  li: ({ children, node }) => {
    const text = extractTextFromNode(node);
    if (text) {
      return (
        <Text style={styles.listItemText}>
          <Text style={styles.bullet}>• </Text>
          {text}
        </Text>
      );
    }
    return (
      <View style={styles.listItem}>
        <Text style={styles.bullet}>•</Text>
        <View style={styles.listItemContent}>
          {wrapStrings(children, styles.listText)}
        </View>
      </View>
    );
  },
  img: ({ src, alt }) => (
    <View style={styles.imageWrapper}>
      <Image style={styles.image} src={src} />
      {alt ? <Text style={styles.imageCaption}>{alt}</Text> : null}
    </View>
  ),
  table: ({ children }) => <View style={styles.table}>{children}</View>,
  thead: ({ children }) => <View>{children}</View>,
  tbody: ({ children }) => <View>{children}</View>,
  tfoot: ({ children }) => <View>{children}</View>,
  tr:    ({ children }) => <View style={styles.tableRow}>{children}</View>,
  th:    ({ children }) => <Text style={styles.tableHeaderCell}>{children}</Text>,
  td:    ({ children }) => <Text style={styles.tableCell}>{children}</Text>,
};

export function MarkdownPDFDocument({ content }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content ?? ''}
        </ReactMarkdown>
      </Page>
    </Document>
  );
}
