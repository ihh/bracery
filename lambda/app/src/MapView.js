import React, { Component } from 'react';
import { ParseTree } from 'bracery';
import { extend } from './bracery-web';
//import GraphView from 'react-digraph';
import GraphView from './react-digraph/components/graph-view';

import './MapView.css';

// Object.fromEntries
const fromEntries = (props_values) => {
  var obj = {};
  props_values.forEach ((prop_value) => {
    obj[prop_value[0]] = prop_value[1];
  })
  return obj;
};

// NodeEditor
// Based on https://hashnode.com/post/tightly-controlled-textareas-building-solid-plain-text-editors-in-react-cj6yvu6yq00cls5wtrbbkw96d
class NodeEditor extends Component {
  constructor(props) {
    super(props);
    this.selectionUpdateEvents = [
      'select',
      'click',
      'focus',
      'keyup'
    ];
  }

  selectionUpdateListener = () => this.props.setEditorState(
    { selection: this.getSelection(this.textarea) }
  );

  focusListener = () => this.props.setEditorState ({ focus: true });
  blurListener = () => this.props.setEditorState ({ focus: false });
  
  getSelection = (textareaRef) => ({
    startOffset: textareaRef.selectionStart,
    endOffset: textareaRef.selectionEnd,
  });

  setSelectionToDOM = (textareaRef, selection) => {
    textareaRef.selectionStart = selection.startOffset;
    textareaRef.selectionEnd = selection.endOffset;
  }

  setSelectionAndFocus = () => {  
    this.setSelectionToDOM (this.textarea, this.props.selection);
    if (this.props.focus) {
      this.removeFocusListeners();
      this.textarea.focus();
      this.addFocusListeners();
    }
  }

  addFocusListeners() {
    this.textarea.addEventListener ('focus', this.focusListener);
    this.textarea.addEventListener ('blur', this.blurListener);
  }

  removeFocusListeners() {
    this.textarea.removeEventListener ('focus', this.focusListener);
    this.textarea.removeEventListener ('blur', this.blurListener);
  }
  
  componentDidMount() {
    this.setSelectionAndFocus();
    this.selectionUpdateEvents.forEach(
      eventType => this.textarea.addEventListener(
        eventType,
        this.selectionUpdateListener
      )
    );
    this.addFocusListeners();
  }

  componentWillUnmount() {
    this.selectionUpdateEvents.forEach(
      eventType => this.textarea.removeEventListener(
        eventType,
        this.selectionUpdateListener
      )
    );
    this.removeFocusListeners();
  }

  componentDidUpdate() {
    this.setSelectionAndFocus();
  }

  onChange = () => this.updateTextarea({
    content: this.textarea.value,
    selection: this.getSelection(this.textarea)
  });

  updateTextarea = ({ content, selection }) => {
    this.props.setEditorState(
      { content, selection },
      () => this.setSelectionToDOM(
        this.textarea,
        selection
      )
    );
  }

  render() {
    return (<textarea
            ref={c => { this.textarea = c; }}
            className={'editor editor-'+(this.props.disabled?'disabled':'enabled')}
            value={this.props.content}
            disabled={this.props.disabled}
            onChange={this.onChange} />);
  }
}

// MapView
class MapView extends Component {
  constructor(props) {
    super(props);
    this.ParseTree = ParseTree;
  }

  // Constants
  get newVarPrefix() { return 'scene' }

  get START() { return 'START'; }
  get SYM_PREFIX() { return 'SYM_'; }
  get LINK_PREFIX() { return 'LINK_'; }

  get nodeSize() { return 150; }
  get edgeHandleSize() { return 50; }
  get edgeArrowSize() { return 10; }

  get layoutRadius() { return 300; }
  get layoutRadiusMultiplier() { return 0.8; }
  get maxNodeTypeTextLen() { return 24; }
  get maxNodeTitleLen() { return 24; }
  get maxEdgeHandleLen() { return 10; }

  get startNodeType() { return 'start'; }
  get definedNodeType() { return 'defined'; }
  get implicitNodeType() { return 'implicit'; }
  get externalNodeType() { return 'external'; }
  get placeholderNodeType() { return 'placeholder'; }

  get placeholderNodeText() { return 'Click to edit'; }
  get emptyNodeText() { return ' '; }

  get includeEdgeType() { return 'include'; }
  get linkEdgeType() { return 'link'; }
  get selectedEdgeTypeSuffix() { return 'Selected'; }

  // Helpers
  truncate (text, len) {
    return (text.length <= len
            ? text
            : (text.substr(0,len) + '...'))
  }

  // escapeTopLevelRegex
  // Parse an expression as Bracery, prefix top-level danger chars with backslashes, then regenerate it as Bracery
  escapeTopLevelRegex (text, regex, config) {
    config = config || {};
    const rhs = ParseTree.parseRhs(text);
    let result = rhs
	  .map ((node) => (typeof(node) === 'string'
			   ? (config.noEscape
			      ? node
			      : node.replace (regex, (m) => '\\'+m))
			   : this.nodeText(node,text)))
	  .join('');
    if (config.stripBracketsFromAlt && rhs.length === 1 && typeof(rhs[0]) === 'object' && rhs[0].type === 'alt')
      result = result.substr(1,result.length-2);
    return result;
  }
  escapeTopLevelBraces (text, config) {
    return this.escapeTopLevelRegex (text, new RegExp ('[@{}[\\]|\\\\]', 'g'), config);
  }
  
  // isLinkShortcut - detects shortcuts of the form [[link to another page]]
  isLinkShortcut (text) {
    return text.match(/^\[\[.*\]\]$/)
     || text.match(/^&layout{[+\-0-9]+,[+\-0-9]+}{\[\[.*\]\]}$/);
  }

  // stripEnclosingBraces - strips curly braces from an expression
  stripEnclosingBraces (text) {
    return text.replace (/^{([\s\S]*)}$/, (_m,c)=>c)
  }

  // parseCoord - parses an X,Y coordinate
  parseCoord (coord) {
    const xy = coord.split(',');
    return { x: parseFloat (xy[0]),
	     y: parseFloat (xy[1]) };
  }

  // Specialized version of ParseTree.findNodes for checking if a tree contains no variables, symbols, or links
  isStaticExpr (rhs) {
    return ParseTree.findNodes (rhs, {
      nodePredicate: function (nodeConfig, node) {
        return (typeof(node) === 'object'
                && (node.type === 'sym'
                    || node.type === 'lookup'
                    || (node.type === 'func'
                        && node.funcname === 'link')))
      }
    }).length === 0
  }

  // Detect if a node in a Bracery parse tree represents an expression of the form #xxx# (a "Tracery-style expression"),
  // which is expanded behind the scenes to &if{$xxx}{&eval$xxx}{~xxx}
  isSingleTraceryNode (rhs) {
    return rhs.length === 1 && ParseTree.isTraceryExpr (rhs[0]);
  }

  // Create the #xxx# Bracery source code for a Tracery-style parse tree node
  makeTraceryText (rhs) {
    return ParseTree.traceryChar + ParseTree.traceryVarName(rhs[0]) + ParseTree.traceryChar;
  }

  // Get the variable names from a parse tree
  getVarNames (rhs) {
    return ParseTree.getSymbolNodes (rhs,
                                     { reportLookups: true,
                                       reportAssigns: true })
      .map ((node) => (node.name || node.varname));
  }

  // Find the max suffix of any autogenerated variable names
  maxVarSuffix (isVarName, prefix) {
    prefix = prefix || this.newVarPrefix;
    const prefixRegex = new RegExp ('^' + prefix + '([0-9]+)$');
    return Object.keys (isVarName)
      .map ((name) => prefixRegex.exec (name))
      .filter ((match) => match)
      .map ((match) => parseInt(match[1]))
      .reduce ((max, n) => Math.max (max, n), 0);
  }

  // Autogenerate a variable name
  newVar (isVarName, prefix) {
    prefix = prefix || this.newVarPrefix;
    const newVarName = prefix + (this.maxVarSuffix (isVarName, prefix) + 1);
    isVarName[newVarName] = true;
    return newVarName;
  }
  
  // graphPosText uses a pos tuple (start,length) to grab a substring of the Bracery text for the graph.
  // The (start,length) correspond to the parse tree node for the expression, so there may be enclosing curly braces; we strip these off.
  graphPosText (graph, pos) {
    return this.stripEnclosingBraces (graph.text.substr (pos[0], pos[1]));
  }

  // graphPosArrayText is like graphPosText, but works on an array of pos tuples
  // (effectively splicing together non-contiguous regions of the text)
  graphPosArrayText (graph, posArray) {
    return posArray.map (this.graphPosText.bind (this, graph)).join('');
  }
  
  // graphEntityText is a wrapper for graphPosText and graphPosArrayText, to be called on a graph entity (node or edge).
  // In general, the start node has a headerPos and a bodyPosArray; all other entities (nodes and edges) have a pos.
  graphEntityText (graph, entity) {
    return this.graphPosArrayText (graph, (entity.headerPos
					   ? [entity.headerPos].concat (entity.bodyPosArray)
					   : [entity.pos]));
  }
  
  // startNodeText is graphEntityText for the start node
  graphStartNodeText (graph) {
    return this.graphText (graph, graph.nodes[0]);
  }

  // parseTreeNodeText is to be called on a Bracery parse tree node,
  // along with the text that was parsed.
  parseTreeNodeText (node, text) {
    if (typeof(text) === 'undefined')
      throw new Error ('parse text undefined');
    return (typeof(node) === 'string'
            ? node
            : (node && node.pos
               ? this.stripEnclosingBraces (text.substr (node.pos[0], node.pos[1]))
               : ''));
  }

  // parseTreeNodesText is to be called on an array of Bracery parse tree nodes (i.e. an "rhs", in Bracery terminology),
  // along with the text that was parsed.
  parseTreeNodesText (nodes, text) {
    return nodes.reduce ((pre, node) => pre + this.parseTreeNodeText (node, text), '') || '';
  }

  // Detect if a node is another node's ancestor
  // TODO: rewrite this using node IDs
  nodeInSubtree (node, subtreeRoot) {
    while (node) {
      if (node.id === subtreeRoot.id)  // compare IDs not nodes themselves, as we do a fair bit of object cloning
	return true;
      node = node.parent;
    }
    return false;
  }

  // Make an @X,Y coordinate tag for a graph node
  makeCoord (node) {
    if (node && typeof(node.x) !== 'undefined') {
      const x = Math.round(node.x), y = Math.round(node.y);
      return '@' + x + ',' + y;
    }
    return '';
  }

  // implicitBracery - calculate the "implicit Bracery" for a graph entity,
  // i.e. what will appear in the editor text window when this entity is selected
  // (which may differ from whatever syntactic sugar is used to represent the entity in the Bracery text).
  // The implicit Bracery is controlled by the entity's 'implicitBracery' object.
  implicitBracery (graph, entity) {
    let entityText = this.graphEntityText (graph, entity);
    if (entity.implicitBracery) {
      if (entity.implicitBracery.isSingleTraceryNode)
	return this.makeTraceryText (entityText);
      if (entity.implicitBracery.isAlternation)
	return ParseTree.leftSquareBraceChar + entityText + ParseTree.rightSquareBraceChar;
    }
    return entityText;
  }

  // makeNodeBracery - regenerate the Bracery for a graph node,
  // overriding the (X,Y) coordinates with whatever is in the graph,
  // and using syntactic sugar for the &layout, &link, and &placeholder functions,
  // i.e. [name@X,Y=>definition...] and so on.
  makeNodeBracery (graph, node) {
    const xy = this.makeCoord(node);
    switch (node.nodeType) {
    case this.externalNodeType:
      return xy && (xy + ParseTree.symChar + node.id.replace(this.SYM_PREFIX,'') + '\n');
    case this.placeholderNodeType:
      return xy && (xy + ParseTree.varChar + node.id + '\n');
    case this.startNodeType:
      return xy && (xy + ':START\n');
    case this.definedNodeType:
      return '[' + node.id + xy + '=>' + this.escapeTopLevelBraces (this.implicitBracery (graph, node), { stripBracketsFromAlt: true }) + ']\n';
    case this.implicitNodeType:
    default:
      return '';
    }
  }

  // makeLinkBracery - regenerate a link of the form [text]{target}
  makeLinkBracery (node, newLinkText, newLinkTarget) {
    const xy = this.makeCoord(node);
    return '['
      + this.escapeTopLevelBraces (newLinkText)
      + ']' + xy + '{'
      + this.escapeTopLevelBraces (newLinkTarget)
      + '}';
  }

  // makeLinkTargetBracery - for a node, generate the Bracery that should appear in the target field of a link, to link to it.
  makeLinkTargetBracery (node) {
    switch (node.nodeType) {
    case this.externalNodeType:
    case this.startNodeType:
      return ParseTree.symChar + node.id.replace(this.SYM_PREFIX,'');
    case this.definedNodeType:
    case this.placeholderNodeType:
      return ParseTree.traceryChar + node.id + ParseTree.traceryChar;
    case this.implicitNodeType:
    default:
      return '';
    }
  }

  // rebuildBracery - regenerate entire Bracery string, with a single node changed/replaced.
  // TODO: rewrite/rethink this. Graph should *always* generate a valid Bracery string that parses back to itself.
  // Our job is to keep the graph maintained so that this serialization-deserialization is always consistent.
  // The edit operations below will then involve updating the 'pos', 'headerPos', and 'bodyPosArray' properties of all graph entities
  // that land after the specified modifications.
  // Eventually ParseTreeGraph should be its own class (or MST model), and these edit operations the actions on the model.
  // But for incremental development, let's first keep it a JSON object that we update consistently.
  rebuildBracery (graph, changedNode) {
    // If we're changing an implicit node or an edge to an implicit node, then just rewrite the substring at changedPos.
    // If we're changing a defined or start node (i.e. at the top level of the file), then rebuild the whole string.
    // This is a bit messy but is consistent with the top-level entities being autonomous, with the implicit ones dangling off them
    // (and being able to select smaller and smaller substrings by clicking on implicit nodes).
    if (changedNode.nodeType === this.implicitNodeType) {
      return this.replaceLink (graph, changedNode);
    } else {
      return graph.nodes
        .filter ((graphNode) => graphNode.nodeType !== this.implicitNodeType)
        .map ((graphNode) => (
        this.nodeInSubtree (graphNode, changedNode)
	    ? this.makeNodeBracery(graph,graphNode)
	  : this.nodeText(graphNode)
      )).join('') + this.startNodeText(graph);
    }
  }

  replaceLink (graph, linkNode, changedPos, newLinkText, newLinkTargetText) {
    changedPos = changedPos || linkNode.pos;
    return this.replaceText (graph.text,
                             [{ startOffset: changedPos[0],
                                endOffset: changedPos[0] + changedPos[1],
                                replacementText: this.makeLinkBracery (linkNode,
                                                                       typeof(newLinkText) === 'undefined'
                                                                       ? this.nodeText(linkNode.linkText)
                                                                       : newLinkText,
                                                                       typeof(newLinkTargetText) === 'undefined'
                                                                       ? this.implicitBracery (graph, linkNode)
                                                                       : newLinkTargetText) }]);
  }

  replaceText (text, edits) {
    edits = edits.sort ((a, b) => a.startOffset - b.startOffset);
    edits.forEach ((edit, n) => {
      if (n > 0 && edit.startOffset < edits[n-1].endOffset)
        throw new Error ("overlapping edits");
    });
    const info = edits.reverse().reduce ((info, edit) => ({ startOffset: edit.startOffset,
                                                            text: edit.replacementText + text.slice (edit.endOffset, info.startOffset) + info.text }),
                                         { startOffset: text.length,
                                           text: '' });
    return text.slice (0, info.startOffset) + info.text;
  }
  
  selectedNode (graph, selected) {
    selected = selected || this.props.selected;
    return (selected.node
            ? graph.nodeByID[selected.node]
            : null);
  }

  selectedNodeText (graph, selected, node) {
    node = node || this.selectedNode (graph, selected);
    return this.implicitBracery (graph, node);
  }

  selectedEdges (graph, selected) {
    selected = selected || this.props.selected;
    return (selected.edge && graph.nodeByID[selected.edge.source]
            ? (graph.nodeByID[selected.edge.source].outgoing[selected.edge.target] || [])
            : null);
  }

  selectedEdge (graph, selected) {
    const edges = this.selectedEdges(graph,selected);
    return edges && edges.length && edges[0];
  }

  selectedEdgeSourceNode (graph, selected) {
    selected = selected || this.props.selected;
    return (selected.edge
            ? graph.nodeByID[selected.edge.source]
            : null);
  }

  selectedEdgeLinkNode (graph, selected) {
    selected = selected || this.props.selected;
    return (selected.edge
            ? graph.nodeByID[selected.edge.link || selected.edge.target]
            : null);
  }

  calculateSelectionRange (enclosingPos, pos) {
    return { startOffset: pos[0] - enclosingPos[0],
	     endOffset: pos[0] + pos[1] - enclosingPos[0] };
  }

  // State modification
  setEvalText (newEvalText) {
    this.props.setAppState ({ evalText: newEvalText });
  }

  setSelected (graph, selected) {
    let editorContent = '', editorSelection = null;
    if (selected.edge) {
      const selectedEdge = this.selectedEdge (graph, selected);
      const selectedSource = this.selectedEdgeSourceNode (graph, selected);
      editorContent = (selectedEdge.edgeType === this.linkEdgeType
                       ? this.nodeText (selectedEdge.linkTextPos)
                       : this.selectedNodeText (graph, selected, selectedSource));
      if (selectedEdge.edgeType === this.includeEdgeType)
        editorSelection = (selectedSource.nodeType === this.implicitNodeType && this.isSingleTraceryNode(selectedSource.rhs)
                           ? { startOffset: 0, endOffset: editorContent.length }
                           : this.calculateSelectionRange (selectedSource.pos, selectedEdge.pos));
    } else if (selected.node)
      editorContent = this.selectedNodeText (graph, selected);
    editorSelection = editorSelection || { startOffset: editorContent.length,
                                           endOffset: editorContent.length };
    const editorDisabled = !(selected.node || selected.edge)
          || (selected.node && this.selectedNode(graph,selected).nodeType === this.externalNodeType);
    this.props.setAppState ({ mapSelection: selected,
                              editorContent: editorContent,
                              editorSelection: editorSelection,
                              editorDisabled: editorDisabled,
                              editorFocus: ((selected.node || selected.edge) && !editorDisabled) });
  }

  setEditorState (graph, selectedNode, selectedEdge, selectedEdgeSource, selectedEdgeLink, newEditorState, callback) {
    const appProp = { focus: 'editorFocus',
                      content: 'editorContent',
                      selection: 'editorSelection' };
    let newAppState = fromEntries (
      Object.keys(appProp)
        .filter ((prop) => newEditorState.hasOwnProperty(prop))
        .map ((prop) => [appProp[prop], newEditorState[prop]]));
    if (newEditorState.hasOwnProperty('content')) {
      if (selectedEdge && selectedEdge.edgeType === this.linkEdgeType) {
        newAppState.evalText = this.replaceLink (graph, selectedEdgeLink, selectedEdge.pos, newEditorState.content);
      } else {
        const oldNode = selectedNode || selectedEdgeSource;
        if (oldNode) {
          const newNode = extend ({},
                                  oldNode,
                                  { rhs: [newEditorState.content],
                                    nodeType: (oldNode.nodeType === this.placeholderNodeType
                                               ? this.definedNodeType
                                               : oldNode.nodeType) });
          const newGraph = extend ({},
                                   graph,
                                   { nodes: graph.nodes.map ((node) => (node === oldNode ? newNode : node)) });
          newAppState.evalText = this.rebuildBracery (newGraph, newNode);
        }
      }
    }
    this.props.setAppState (newAppState, callback);
  }

  createNode (graph, x, y) {
    const id = this.newVar (graph.isVarName);
    let newNode = { id: id,
                    x: Math.round(x),
                    y: Math.round(y),
                    type: this.definedNodeType,
                    nodeType: this.definedNodeType,
                    typeText: ParseTree.traceryChar + id + ParseTree.traceryChar,
                    title: this.emptyNodeText,
                    rhs: [] };
    let newGraph = this.cloneLayoutGraph(graph);
    newGraph.nodes.push (newNode);
    newGraph.nodeByID[id] = newNode;
    const newEvalText = this.rebuildBracery (newGraph, newNode);
    this.props.setAppState ({ mapSelection: { node: id },
                              editorContent: '',
                              editorSelection: { startOffset: 0, endOffset: 0 },
                              editorDisabled: false,
                              editorFocus: true,
                              evalText: newEvalText });
  }

  createEdge (graph, source, target) {
    let newGraph = this.cloneLayoutGraph(graph);
    let newSource = newGraph.nodeByID[source.id];
    let newEdge = { source: source.id,
		    target: target.id,
                    type: this.linkEdgeType };
    newGraph.edges.push (newEdge);
    this.afterAddEdge (newEdge, newGraph.nodeByID);

    let link = null, linkText = null;
    if (target.nodeType === this.externalNodeType) {
      linkText = target.id.replace(this.SYM_PREFIX,'');
      link = this.makeLinkBracery (null, linkText, ParseTree.symChar + linkText);
    } else
      link = '[[' + (linkText = target.id) + ']]';
    newSource.rhs = [this.implicitBracery (graph, newSource) + link];
    
    const newEvalText = this.rebuildBracery (newGraph, newSource);

    this.props.setAppState ({ mapSelection: { edge: { source: source.id,
						      target: target.id } },
                              editorContent: linkText,
                              editorSelection: { startOffset: linkText.length, endOffset: linkText.length },
                              editorDisabled: false,
                              editorFocus: true,
                              evalText: newEvalText });
    
  }
  
  swapEdge (graph, sourceNode, targetNode, edge) {
    const newTargetText = this.makeLinkTargetBracery (targetNode);
    const newEvalText = (edge.edgeType === this.includeEdgeType
                         ? this.replaceText (graph.text,
                                             [{ startOffset: edge.pos[0],
                                                endOffset: edge.pos[0] + edge.pos[1],
                                                replacementText: newTargetText }])
                         : this.replaceLink (graph, graph.nodeByID[edge.link], edge.pos, undefined, newTargetText));

    this.props.setAppState ({ evalText: newEvalText,
                              mapSelection: {},
                              editorContent: '',
                              editorSelection: { startOffset: 0, endOffset: 0 },
                              editorDisabled: true,
                              editorFocus: false });
  }

  // Graph-building helpers
  afterAddEdge (edge, nodeByID, childRank) {
    let sourceNode = nodeByID[edge.source], targetNode = nodeByID[edge.target];
    sourceNode.outgoing[edge.target] = (sourceNode.outgoing[edge.target] || []).concat ([edge.childRank]);
    targetNode.incoming[edge.source] = (targetNode.incoming[edge.source] || []).concat ([edge.childRank]);
    sourceNode.includeOrder.push (targetNode);
    edge.totalIncluded = () => sourceNode.includeOrder.length;
    edge.includeRank = edge.totalIncluded();
    if (childRank) {
      let srcChildRank = childRank[edge.source];
      if (!srcChildRank[edge.target])
	srcChildRank[edge.target] = edge.includeRank;
    }
    edge.edgeType = edge.type;  // preserve type against later modification of selected edge type
    return edge;
  }

  // Get graph by analyzing parsed Bracery expression
  getLayoutGraph() {
    const mv = this;
    const rhs = this.props.rhs;
    const text = this.props.evalText;
    const symName = this.props.name;
    const selected = this.props.selected;
    const startNodeName = this.SYM_PREFIX + symName;
    // Scan parsed Bracery code for top-level global variable assignments of the form $variable=&quote{...} or $variable=&let$_xy{...}&quote{...}
    let nodeOffset = 0, startPosOffset = 0, topLevelNodes = [], edges = [], braceryStartNodeRhs = [], startBodyPosArray = [];
    let nodeByID = {}, braceryNodeByID = {}, braceryNodeRhsByID = {};  // We will not keep the maps to the Bracery parse tree, but use them for analysis when building the graph
    const pushNode = (nodes, node, parseTreeNode, parseTreeNodeRhs, config) => {
      nodeByID[node.id] = node;
      if (parseTreeNode)
	braceryNodeByID[node.id] = parseTreeNode;
      if (parseTreeNodeRhs)
	braceryNodeRhsByID[node.id] = parseTreeNodeRhs;
      if (config && config.insertAtStart)
        nodes.splice(0,0,node);
      else
        nodes.push(node);
    };
    while (nodeOffset < rhs.length) {
      let braceryNode = rhs[nodeOffset], braceryNodeRhs = [];
      if (ParseTree.isQuoteAssignExpr (braceryNode)
          || ParseTree.isLayoutAssign (braceryNode)
          || ParseTree.isPlaceholderExpr (braceryNode)) {
        let node = { pos: braceryNode.pos };
	let coord = null;
        if (ParseTree.isPlaceholderExpr (braceryNode)) {
	  const heldNode = ParseTree.getPlaceholderNode (braceryNode);
	  const heldNodeType = heldNode && heldNode.type;
	  coord = ParseTree.getPlaceholderCoord (braceryNode);
	  if (heldNodeType === 'lookup') {
	    node.id = heldNode.varname;
	    node.nodeType = mv.placeholderNodeType;
	  } else if (heldNodeType === 'sym') {
	    node.id = mv.SYM_PREFIX + heldNode.name;
	    node.nodeType = mv.externalNodeType;
	  } else {
	    node.id = startNodeName;
	    node.nodeType = mv.startNodeType;
	  }
        } else {
	  node.id = braceryNode.varname.toLowerCase();
          node.nodeType = this.definedNodeType;
	  if (ParseTree.isLayoutAssign (braceryNode)) {
	    let expr = ParseTree.getLayoutExpr (braceryNode);
	    coord = ParseTree.getLayoutCoord (expr);
	    braceryNodeRhs = ParseTree.getLayoutContent (expr);
	  } else
	    braceryNodeRhs = ParseTree.getQuoteAssignRhs (braceryNode);
        }
        if (coord)
          extend (node, this.parseCoord (coord))
        topLevelNodes = topLevelNodes.filter ((n) => n.id !== node.id);
	pushNode (topLevelNodes,
		  node,
		  braceryNode,
		  braceryNodeRhs,
		  { insertAtStart: node.nodeType === this.startNodeType,
		    implicitBracery: { isAlternation: (braceryNodeRhs.length === 1
						       && typeof(braceryNodeRhs[0]) === 'object'
						       && braceryNodeRhs[0].type === 'alt') } });
	startOffset = braceryNode.pos[0] + braceryNode.pos[1];
      } else if (this.isStaticExpr ([braceryNode])) {
	braceryStartNodeRhs.push (braceryNode);
        startBodyPosArray.push (braceryNode.pos);
	startOffset = (typeof(braceryNode) === 'string'
		       ? braceryNode.length
		       : (braceryNode.pos[0] + braceryNode.pos[1]));
      } else {
	console.warn ('header ends at ' + startOffset)
        break;
      }
      ++nodeOffset;
    }

    // Add a start node for everything that is *not* part of a top-level global variable assignment
    if (!nodeByID[startNodeName]) {
      const startNode = { id: startNodeName,
	                  pos: [0, 0],
                          nodeType: this.startNodeType };
      pushNode (topLevelNodes,
		startNode,
		null,
		null,
		{ insertAtStart: true });
    }
    let startNode = topLevelNodes[0];
    startNode.headerPos = startNode.pos;
    if (startOffset < text.length)
      startNode.bodyPosArray = startBodyPosArray.concat ([startOffset, text.length - startOffset]);
    delete startNode.pos;

    // Define some searches of the parse tree
    const getTargetNodes = (node, config, namer) => {
      return ParseTree.getSymbolNodes (braceryNodeRhsByID[node.id], config)
        .map ((target) => extend (target, { graphNodeName: namer(target) }))
        .filter ((target) => target.graphNodeName !== node.id);
    };
    // In these searches we need to auto-name some unnamed nodes.
    // It's generally better if we pick names that are robust to changes in the source text,
    // otherwise we can confuse react-digraph by changing the graph through the UI component
    // in a way that invalidates the component's internal state (by changing node names).
    let nLinkedNodes = 0;
    const linkNamer = (n) => this.LINK_PREFIX + (++nLinkedNodes);
    const getLinkedNodes = (node) => getTargetNodes (node,
                                                     { ignoreSymbols: true,
                                                       ignoreTracery: true,
                                                       reportLinks: true,
                                                       addParentLinkInfo: true },
                                                     linkNamer);
    const getIncludedNodes = (node) => getTargetNodes (node,
                                                       { ignoreSymbols: true,
                                                         ignoreLinkSubtrees: true,
                                                         reportEvals: true },
                                                       (n) => ParseTree.isEvalVar(n) ? ParseTree.getEvalVar(n) : n.name);
    const getExternalNodes = (node) => getTargetNodes (node,
                                                       { ignoreTracery: true,
                                                         ignoreLinkSubtrees: true },
                                                       (n) => this.SYM_PREFIX + n.name);

    // Create implicit nodes for links
    let implicitNodes = [];
    topLevelNodes.forEach (
      (topLevelNode) =>
        getLinkedNodes(topLevelNode)
        .forEach ((linkNode) => {
          const isLink = ParseTree.isLinkExpr(linkNode);
          const isLayoutLink = ParseTree.isLayoutLinkExpr(linkNode);
          const parent = (linkNode.inLink && linkNode.link
                          ? nodeByID[linkNode.link.graphNodeName]
                          : topLevelNode);
          const actualLinkNode = (isLink
                                  ? linkNode
                                  : (isLayoutLink
                                     ? ParseTree.getLayoutLink(linkNode)
                                     : null));
          const linkTargetRhs = ParseTree.getLinkTargetRhs(actualLinkNode);
          let uniqueTarget = null;
          if (linkTargetRhs.length === 1) {
            if (ParseTree.isEvalVar(linkTargetRhs[0]))
              uniqueTarget = ParseTree.getEvalVar(linkTargetRhs[0]);
            else if (linkTargetRhs[0].type === 'sym')
              uniqueTarget = this.SYM_PREFIX + linkTargetRhs[0].name;
            else if (ParseTree.isTraceryExpr(linkTargetRhs[0]))
              uniqueTarget = ParseTree.traceryVarName(linkTargetRhs[0]);
          }
          const implicitNode = extend (
            {
              id: linkNode.graphNodeName,
              pos: linkNode.pos,
              parent: parent,
              nodeType: this.implicitNodeType,
              linkText: ParseTree.getLinkText (actualLinkNode),
            },
            uniqueTarget ? {uniqueTarget} : {},
            (isLayoutLink
             ? this.parseCoord (ParseTree.getLayoutCoord (linkNode))
             : {}));
          pushNode (implicitNodes, implicitNode, linkNode, linkTargetRhs);
        }));

    // Create placeholders for unknown & external nodes
    const realNodes = topLevelNodes.concat (implicitNodes);
    let placeholderNodes = [];
    const createPlaceholders = (getter, attrs) => (node) => {
      getter(node).forEach ((target) => {
	const targetNode = nodeByID[target.graphNodeName];
        if (targetNode) {
	  if (!targetNode.parent && targetNode.nodeType !== mv.startNodeType && !mv.nodeInSubtree (node, targetNode))
	    targetNode.parent = node;
	} else {
	  const newNode = extend ({ id: target.graphNodeName,
				    pos: [0, 0],
                                    parent: node,
                                    rhs: [] },
				  attrs);
          pushNode (placeholderNodes, newNode);
        }
      });
    }
    realNodes.forEach (createPlaceholders (getIncludedNodes, { nodeType: mv.placeholderNodeType }));
    realNodes.forEach (createPlaceholders (getExternalNodes, { nodeType: mv.externalNodeType }));
    
    // Do some common initializing, and create edges
    const allNodes = realNodes.concat(placeholderNodes);
    let childRank = fromEntries (allNodes.map ((node) => [node.id, {}]));
    allNodes.forEach ((node) => { node.incoming = {}; node.outgoing = {}; node.includeOrder = []; });
    const addEdge = ((edge) => {
      edges.push (edge);
      return this.afterAddEdge (edge, nodeByID, childRank);
    });
    allNodes.forEach ((node) => {
      // Create outgoing include edges
      if (!node.uniqueTarget)
        getIncludedNodes (node)
        .concat (getExternalNodes (node))
        .map ((target) => addEdge ({ source: node.id,
                                     target: target.graphNodeName,
                                     type: mv.includeEdgeType,
                                     pos: target.pos }))
    });
    // Create link edges
    implicitNodes.forEach ((node) => addEdge (extend ({ source: node.parent.id,
                                                        type: mv.linkEdgeType,
                                                        pos: node.pos,
							linkTextPos: node.linkText.pos },
                                                      (node.uniqueTarget
                                                       ? { target: node.uniqueTarget,
                                                           link: node.id }
                                                       : { target: node.id }))));

    // Remove any placeholders, implicit, or external nodes that don't have incoming edges
    const nodeUnreachable = (node) => ((node.nodeType === this.placeholderNodeType
                                        || node.nodeType === this.externalNodeType
                                        || node.nodeType === this.implicitNodeType)
                                       && !Object.keys(node.incoming).length);
    const keptNodes = allNodes.filter ((node) => !nodeUnreachable(node));

    // Create tree structure
    // - Ensure every node (except start) has a parent.
    // - If a node's parent is a skipped implicit node (i.e. an implicit node with a unique target),
    //   then set the node's parent to its grandparent; repeat until the parent is not a skipped implicit node.
    // - Sort children by the order that the parent->child edges appear.
    //   This keeps the automatic hierarchical layout stable when we add placeholders, etc.
    let nOrphans = 0;
    keptNodes.forEach ((node) => node.children = []);
    keptNodes.forEach ((node, n) => {
      if (n > 0) {
        if (!node.parent) {  // if a node is not referenced by any other node, set its parent to be the start node
	  node.parent = startNode;
          if (typeof(node.x) === 'undefined')
            childRank[startNode.id][node.id] = startNode.includeOrder.length + (++nOrphans);
        }
        while (node.parent.uniqueTarget)
          node.parent = node.parent.parent;
	node.parent.children.push (node);
      }
      node.depth = 0;
      for (let n = node; n.parent; n = n.parent)
	++node.depth;
    });
    keptNodes.forEach ((parent) => parent.children.forEach ((child) => {
      child.childRank = childRank[parent.id][child.id];
    }));
    keptNodes.forEach ((node) => {
      node.children = node.children.sort ((a,b) => a.childRank - b.childRank);
      node.maxChildRank = node.children.reduce ((max, c) => typeof(c.childRank) === 'undefined' ? max : Math.max (max, c.childRank), 0);
      node.children.forEach ((child) => { child.relativeChildRank = child.childRank / (node.maxChildRank + 1) });
    });
    
    // Lay things out
    const layoutNode = (node) => {
      // If no (x,y) specified, lay out nodes from the parent node
      if (typeof(node.x) === 'undefined') {
        if (node.parent) {
	  layoutNode (node.parent);
	  const angleRange = Math.PI, angleOffset = -angleRange/2;
	  const angle = angleOffset + angleRange * node.relativeChildRank;
	  const radius = mv.layoutRadius;
	  node.x = node.parent.x + Math.cos(angle) * radius;
	  node.y = node.parent.y + Math.sin(angle) * radius;
        } else
          node.x = node.y = 0;
	node.autoLayout = true;
      }
      node.orig = { x: node.x, y: node.y };
    };
    keptNodes.forEach (layoutNode);

    // Mark selected node/edge
    if (selected.node && nodeByID[selected.node])
      nodeByID[selected.node].selected = true;
    else if (selected.edge
             && nodeByID[selected.edge.source]
             && nodeByID[selected.edge.target]) {
      (nodeByID[selected.edge.source].outgoing[selected.edge.target] || [])
        .forEach ((edge) => {
          edge.selected = true;
          edge.type += mv.selectedEdgeTypeSuffix;
        });
      nodeByID[selected.edge.source].selectedOutgoingEdge = true;
      nodeByID[selected.edge.target].selectedIncomingEdge = true;
    }
    
    // Return
    let graph = { nodes: keptNodes,
		  edges,
		  nodeByID,
		  text,
		  isVarName: fromEntries (this.getVarNames(rhs).map ((name) => [name, true])),
		};

    allNodes.forEach ((node) => {
      let typeText = null, title = null;
      switch (node.nodeType) {
      case this.externalNodeType:
        typeText = node.id.replace (this.SYM_PREFIX, ParseTree.symChar) + ' ';
        title = '';
        break;
      case this.placeholderNodeType:
        typeText = ParseTree.traceryChar + node.id + ParseTree.traceryChar;
        title = this.placeholderNodeText;
        break;
      case this.implicitNodeType:
        typeText = this.nodeText (node.linkText);
        title = this.implicitBracery (graph, node);
        break;
      case this.startNodeType:
        typeText = ParseTree.symChar + symName + ' ';
        title = this.nodesText (braceryNodeRhsById[node.id]);
        break;
      default:
        typeText = ParseTree.traceryChar + node.id + ParseTree.traceryChar;
        title = this.implicitBracery (graph, node);
        break;
      }
      node.type = node.id;
      node.typeText = this.truncate (typeText, this.maxNodeTypeTextLen);
      node.title = this.truncate (title, this.maxNodeTitleLen);
    });
    
    // Return
    return graph;
  }

  // Clone layout graph
  // Not a pure clone, e.g. does not deep-clone incoming & outgoing edge lists in each node, or hierarchical layout, or parse tree
  cloneLayoutGraph (graph) {
    const newNodes = graph.nodes.slice(0).map ((node) => extend ({}, node));
    return { nodes: newNodes,
	     edges: graph.edges.slice(0),
             nodeByID: fromEntries (newNodes.map ((node) => [node.id, node])),
             text: graph.text,
             isVarName: extend ({}, graph.isVarName),
           };
  }

  // Event handlers
  eventHandlers (graph) {
    return {
      onCreateNode: (x, y, event) => {
//        console.warn ('onCreateNode',{x,y,event});
        this.createNode (graph, x, y);
      },
      onDeleteNode: (selected, nodeId, nodes) => {
        console.warn ('onDeleteNode',{selected,nodeId,nodes})
	console.error ('onDeleteNode should be unreachable through the UI');
      },
      onCreateEdge: (sourceNode, targetNode) => {
//        console.warn ('onCreateEdge',{sourceNode, targetNode})
	this.createEdge (graph, sourceNode, targetNode);
      },
      canSwapEdge: (sourceNode, targetNode, edge) => {
//        console.warn ('canSwapEdge',{sourceNode, targetNode, edge})
        return targetNode.nodeType !== this.implicitNodeType;
      },
      onSwapEdge: (sourceNode, targetNode, edge) => {
//        console.warn ('onSwapEdge',{sourceNode, targetNode, edge})
        this.swapEdge (graph, sourceNode, targetNode, edge);
      },
      onDeleteEdge: (selectedEdge, edges) => {
        console.warn ('onDeleteEdge',{selectedEdge, edges})
	console.error ('onDeleteEdge should be unreachable through the UI');
      },
      canDeleteNode: (selected) => {
//        console.warn ('canDeleteNode',{selected})
	return false;
      },
      canCreateEdge: (sourceNode, targetNode) => {
//        console.warn ('canCreateEdge',{sourceNode, targetNode})
        if (!targetNode) {
	  sourceNode = typeof(sourceNode) === 'object' ? sourceNode : graph.nodeByID[sourceNode];
	  return sourceNode && sourceNode.nodeType !== this.placeholderNodeType;
	}
	return targetNode.nodeType !== this.implicitNodeType;
      },
      canDeleteEdge: (selected) => {
//        console.warn ('canDeleteEdge',{selected})
	return false;
      },
      afterRenderEdge: (id, element, edge, edgeContainer, isEdgeSelected) => {
//        console.warn ('afterRenderEdge', {id, element, edge, edgeContainer, isEdgeSelected})

      },
      onUpdateNode: (node) => {
        if (node.x !== node.orig.x || node.y !== node.orig.y)
          this.setEvalText (this.rebuildBracery (graph, node));
      },
      onSelectNode: (node) => {
        this.setSelected (graph,
                          node
                          ? { node: node.id }
                          : {});
      },
      onSelectEdge: (edge) => {
        this.setSelected (graph,
                          edge
                          ? { edge: { source: edge.source,
                                      target: edge.target,
                                      link: edge.link } }
                          : {});
      }
    };
  }

  // <textarea> for selected node/edge
  selectionTextArea (graph) {
    this.assertSelectionValid (graph);
    return (<NodeEditor
            setEditorState={this.setEditorState.bind(this,graph,this.selectedNode(graph),this.selectedEdge(graph),this.selectedEdgeSourceNode(graph),this.selectedEdgeLinkNode(graph))}
            content={this.props.editorContent}
            selection={this.props.editorSelection}
            disabled={this.props.editorDisabled}
            focus={this.props.editorFocus} />);
  }

  assertSelectionValid (graph) {
    if (this.props && this.props.selected) {
      if (this.props.selected.node && !this.selectedNode(graph))
        console.error("Lost selected.node",this.props.selected.node);
      if (this.props.selected.edge && !this.selectedEdge(graph))
        console.error("Lost selected.edge",this.props.selected.edge);
    } else
      throw new Error ('no props.selected');
  }
  
  // Render graph
  render() {
    const rhs = this.props.rhs;
    const graph = this.getLayoutGraph (rhs);
//    console.warn('start node:',graph.nodes[0].x,graph.nodes[0].y);
    console.dir(graph);
    //    console.dir(selected);
    const nodeTypes = fromEntries (
      graph.nodes.map (
        (node) => {
          const nodeClass = node.nodeType + '-node'
                + (node.selected
                   ? ' selected-node'
                   :(node.selectedOutgoingEdge
                     ? ' selected-edge-source-node'
                     :(node.selectedIncomingEdge
                       ? ' selected-edge-target-node'
                       : '')));
          return [
          node.id,
          ({ shapeId: '#' + node.id,
             typeText: node.typeText,
	     shape: (node.nodeType === this.implicitNodeType
                     ? (
                         <symbol viewBox="0 0 150 60" id={node.id} key="0">
                         <rect x="0" y="0" width="150" height="60" style={{fill:'none',stroke:'none'}}></rect>
                         <rect x="0" y="0" width="80" height="60" className={nodeClass}></rect>
                         <rect x="70" y="0" width="80" height="60" className={nodeClass}></rect>
                         <rect x="0" y="0" width="80" height="60" className={nodeClass} style={{stroke:'none'}}></rect>
                         <rect x="70" y="0" width="80" height="60" className={nodeClass} style={{stroke:'none'}}></rect>
                         </symbol>
	             )
                     : (
                         <symbol viewBox="0 0 150 60" id={node.id} key="0">
                         <rect x="0" y="0" width="150" height="60" className={nodeClass}></rect>
                         </symbol>
	             ))
           })];
        }));
    const edgeTypes = fromEntries (['',this.selectedEdgeTypeSuffix].reduce ((a, selectedSuffix) => a.concat ([
      ['include'+selectedSuffix, {
	shapeId: '#includeEdge'+selectedSuffix,
	shape: (
            <symbol viewBox="0 0 60 60" id={'includeEdgeHandle'+selectedSuffix} key="0">
            </symbol>
	)
      }],
      ['link'+selectedSuffix, {
	shapeId: '#linkEdge'+selectedSuffix,
	shape: (
            <symbol viewBox="0 0 60 60" id={'linkEdge'+selectedSuffix} key="1">
            <ellipse cx="22" cy="30" rx="10" ry="8" className={'linkEdgeHandle'+selectedSuffix}></ellipse>
            <ellipse cx="38" cy="30" rx="10" ry="8" className={'linkEdgeHandle'+selectedSuffix}></ellipse>
            <ellipse cx="22" cy="30" rx="10" ry="8" className={'linkEdgeHandle'+selectedSuffix} style={{fill:'none'}}></ellipse>
            </symbol>
	)
      }]]), []));
    const handler = this.eventHandlers(graph);
    return (<div>
            <div className="mapview">
	    <GraphView
            nodeKey="id"
	    nodes={graph.nodes}
	    edges={graph.edges}
	    edgeTypes={edgeTypes}
	    nodeTypes={nodeTypes}
	    nodeSubtypes={{}}
            selected={this.props.selected && (this.props.selected.node || this.props.selected.edge)}
            nodeSize={this.nodeSize}
            edgeHandleSize={this.edgeHandleSize}
            edgeArrowSize={this.edgeArrowSize}
            onUpdateNode={handler.onUpdateNode}
            onSelectNode={handler.onSelectNode}
            onSelectEdge={handler.onSelectEdge}
            onCreateNode={handler.onCreateNode}
            onDeleteNode={handler.onDeleteNode}
            onCreateEdge={handler.onCreateEdge}
            onSwapEdge={handler.onSwapEdge}
            onDeleteEdge={handler.onDeleteEdge}
            canSwapEdge={handler.canSwapEdge}
            canDeleteNode={handler.canDeleteNode}
            canCreateEdge={handler.canCreateEdge}
            canDeleteEdge={handler.canDeleteEdge}
            afterRenderEdge={handler.afterRenderEdge}
	    zoomLevel="1"
	    />
            </div>
            <div className="editorcontainer">
	    {this.selectionTextArea (graph)}
            </div>
	    </div>);
  }
}

export default MapView;
