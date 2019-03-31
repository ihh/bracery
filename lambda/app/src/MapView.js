import React, { Component } from 'react';
import { ParseTree } from 'bracery';
import { extend } from './bracery-web';
import { GraphView } from 'react-digraph';

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

  get showEdgeRank() { return false; }
  
  // Helpers
  truncate (text, len) {
    return (text.length <= len
            ? text
            : (text.substr(0,len) + '...'))
  }

  // escapeTopLevelRegex
  // Parse an expression as Bracery, prefix top-level danger chars with backslashes, then regenerate it as Bracery
  escapeTopLevelRegex (text, regex) {
    return ParseTree.parseRhs(text)
      .map ((node) => (typeof(node) === 'string'
                       ? node.replace (regex, (m) => '\\'+m)
                       : this.nodeText(node,text)))
      .join('');
  }
  escapeTopLevelBraces (text) {
    return this.escapeTopLevelRegex (text, /[@[\]{}|\\]/g);
  }
  
  // isLinkShortcut
  isLinkShortcut (text) {
    return text.match(/^\[\[.*\]\]$/)
     || text.match(/^&layout{[+\-0-9]+,[+\-0-9]+}{\[\[.*\]\]}$/);
  }

  // parseCoord
  parseCoord (coord) {
    const xy = coord.split(',');
    return { x: parseFloat (xy[0]),
	     y: parseFloat (xy[1]) };
  }

  isSingleTraceryNode (rhs) {
    return rhs.length === 1 && ParseTree.isTraceryExpr (rhs[0]);
  }

  makeTraceryText (rhs) {
    return ParseTree.traceryChar + ParseTree.traceryVarName(rhs[0]) + ParseTree.traceryChar;
  }

  implicitBracery (rhs) {
    return (this.isSingleTraceryNode (rhs)
            ? this.makeTraceryText (rhs)
            : this.nodesText (rhs));
  }

  // graphNodeText is to be called on a graph node
  graphNodeText (node) {
    return this.nodeText(node) + (node.nodeType === this.startNodeType
                                  ? this.nodesText(node.rhs)
                                  : '')
  }
  
  // nodeText is to be called on a Bracery parse tree node (it references the "pos" attribute)
  // It is also called by graphNodeText on graph nodes, which copy the parse tree node's "pos"
  nodeText (node, text) {
    if (typeof(text) === 'undefined')
      text = this.props.evalText;
    return (typeof(node) === 'string'
            ? node
            : (node && node.pos
               ? text.substr (node.pos[0], node.pos[1]).replace (/^{([\s\S]*)}$/, (_m,c)=>c)
               : ''));
  }

  // nodesText is to be called on an array of Bracery parse tree nodes
  nodesText (nodes, text) {
    const mv = this;
    return nodes.reduce((pre,node) => pre + mv.nodeText(node,text),'') || '';
  }
  
  startNodeText (graph, text) {
    return this.nodesText (graph.nodes[0].rhs, text, false)
  }
  
  nodeInSubtree (node, subtreeRoot) {
    while (node) {
      if (node.id === subtreeRoot.id)  // compare IDs not nodes themselves, as we do a fair bit of object cloning
	return true;
      node = node.parent;
    }
    return false;
  }

  makeNodeBracery (node) {
    const x = Math.round(node.x), y = Math.round(node.y);
    switch (node.nodeType) {
    case this.externalNodeType:
      return '@' + x + ',' + y + ParseTree.symChar + node.id.replace(this.SYM_PREFIX,'') + '\n';
    case this.placeholderNodeType:
      return '@' + x + ',' + y + ParseTree.varChar + node.id + '\n';
    case this.startNodeType:
      return '@' + x + ',' + y + ':START\n';
    case this.definedNodeType:
      return '[' + node.id + '@' + x + ',' + y + '=>' + this.escapeTopLevelBraces (this.nodesText (node.rhs)) + ']\n';
    case this.implicitNodeType:
    default:
      return '';
    }
  }
  
  makeLinkBracery (node, newLinkText, newLinkTarget) {
    const x = Math.round(node.x), y = Math.round(node.y);
    return '['
      + this.escapeTopLevelBraces (newLinkText)
      + ']@' + x + ',' + y + '{'
      + this.escapeTopLevelBraces (newLinkTarget)
      + '}';
  }

  rebuildBracery (graph, changedNode, changedPos, newLinkText) {
    // If we're changing an implicit node or an edge to an implicit node, then just rewrite the substring.
    // If we're changing a defined or start node (i.e. at the top level of the file), then rebuild the whole string.
    // This is a bit messy but is consistent with the top-level entities being autonomous, with the implicit ones dangling off them
    // (and being able to select smaller and smaller substrings by clicking on implicit nodes).
    if (changedNode.nodeType === this.implicitNodeType) {
      changedPos = changedPos || changedNode.pos;
      return graph.text.substr (0, changedPos[0])
        + this.makeLinkBracery (changedNode,
                                typeof(newLinkText) === 'undefined'
                                ? this.nodeText(changedNode.linkText)
                                : newLinkText,
                                this.implicitBracery (changedNode.rhs))
        + graph.text.substr (changedPos[0] + changedPos[1]);
    } else {
      return graph.nodes
        .filter ((graphNode) => graphNode.nodeType !== this.implicitNodeType)
        .map ((graphNode) => (
        this.nodeInSubtree (graphNode, changedNode)
	  ? this.makeNodeBracery(graphNode)
	  : this.nodeText(graphNode)
      )).join('') + this.startNodeText(graph);
    }
  }
  
  selectedNode (graph, selected) {
    selected = selected || this.props.selected;
    return (selected.node
            ? graph.nodeByID[selected.node]
            : null);
  }

  selectedNodeText (graph, selected, node) {
    node = node || this.selectedNode (graph, selected);
    return this.implicitBracery (node.rhs);
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

  selectedEdgeTargetNode (graph, selected) {
    selected = selected || this.props.selected;
    return (selected.edge
            ? graph.nodeByID[selected.edge.target]
            : null);
  }

  calculateSelectionRange (rhs, pos) {
    let offset = 0, range = null;
    range = rhs.reduce ((r, rhsNode) => {
      if (!r) {
        if (typeof(rhsNode) === 'string')
          offset += rhsNode.length;
        else if (rhsNode.pos) {
          if (pos[0] >= rhsNode.pos[0] && pos[0] < rhsNode.pos[0] + rhsNode.pos[1])
            r = [offset + pos[0] - rhsNode.pos[0], pos[1]];
          else
            offset += rhsNode.pos[1];
        } else
          console.error ('rhsNode without pos', rhsNode);
      }
        return r;
    }, range);
    range = range || [offset, 0];
    return { startOffset: range[0], endOffset: range[0] + range[1] };
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
                       ? this.nodeText (selectedEdge.parseTreeNode.linkText)
                       : this.selectedNodeText (graph, selected, selectedSource));
      if (selectedEdge.edgeType === this.includeEdgeType)
        editorSelection = (selectedSource.nodeType === this.implicitNodeType && this.isSingleTraceryNode(selectedSource.rhs)
                           ? { startOffset: 0, endOffset: editorContent.length }
                           : this.calculateSelectionRange (selectedSource.rhs, selectedEdge.pos));
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

  setEditorState = (graph, selectedNode, selectedEdge, selectedEdgeSource, selectedEdgeTarget, newEditorState, callback) => {
    const appProp = { focus: 'editorFocus',
                      content: 'editorContent',
                      selection: 'editorSelection' };
    let newAppState = fromEntries (
      Object.keys(appProp)
        .filter ((prop) => newEditorState.hasOwnProperty(prop))
        .map ((prop) => [appProp[prop], newEditorState[prop]]));
    if (newEditorState.hasOwnProperty('content')) {
      if (selectedEdge && selectedEdge.edgeType === this.linkEdgeType) {
        newAppState.evalText = this.rebuildBracery (graph, selectedEdgeTarget, selectedEdge.parseTreeNode.pos, newEditorState.content);
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
  
  // Get graph by analyzing parsed Bracery expression
  getLayoutGraph() {
    const mv = this;
    const rhs = this.props.rhs;
    const text = this.props.evalText;
    const symName = this.props.name;
    const selected = this.props.selected;
    const startNodeName = this.SYM_PREFIX + symName;
    // Scan parsed Bracery code for top-level global variable assignments of the form $variable=&quote{...} or $variable=&let$_xy{...}&quote{...}
    let nodeOffset = 0, topLevelNodes = [], edges = [], startRhs = [];
    let nodeByID = {};
    const pushNode = (nodes, node, config) => {
      nodeByID[node.id] = node;
      if (config && config.insertAtStart)
        nodes.splice(0,0,node);
      else
        nodes.push(node);
    };
    while (nodeOffset < rhs.length) {
      let braceryNode = rhs[nodeOffset];
      if (ParseTree.isQuoteAssignExpr (braceryNode)
          || ParseTree.isLayoutAssign (braceryNode)
          || ParseTree.isPlaceholderExpr (braceryNode)) {
        let node = { pos: braceryNode.pos }, coord = null;
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
	  node.rhs = [];
        } else {
	  node.id = braceryNode.varname.toLowerCase();
          node.nodeType = this.definedNodeType;
	  if (ParseTree.isLayoutAssign (braceryNode)) {
	    let expr = ParseTree.getLayoutExpr (braceryNode);
	    coord = ParseTree.getLayoutCoord (expr);
	    node.rhs = ParseTree.getLayoutContent (expr);
	  } else
	    node.rhs = ParseTree.getQuoteAssignRhs (braceryNode);
        }
        if (coord)
          extend (node, this.parseCoord (coord))
        topLevelNodes = topLevelNodes.filter ((n) => n.id !== node.id);
	pushNode (topLevelNodes, node, { insertAtStart: node.nodeType === this.startNodeType });
      } else if (ParseTree.isStaticExpr ([braceryNode]))
        startRhs.push (braceryNode);
      else
        break;
      ++nodeOffset;
    }

    // Add a start node for everything that is *not* part of a top-level global variable assignment
    if (!nodeByID[startNodeName]) {
      const startNode = { id: startNodeName,
	                  pos: [0, 0],
                          nodeType: this.startNodeType };
      pushNode (topLevelNodes, startNode, { insertAtStart: true });
    }
    topLevelNodes[0].rhs = startRhs.concat (rhs.slice (nodeOffset));

    // Define some searches of the parse tree
    const getTargetNodes = (node, config, namer) => {
      return ParseTree.getSymbolNodes (node.rhs, config)
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
                                                       reportLinksAsSymbols: true,
                                                       addParentLinkInfo: true },
                                                     linkNamer);
    const getIncludedNodes = (node) => getTargetNodes (node,
                                                       { ignoreSymbols: true,
                                                         ignoreLinkSubtrees: true,
                                                         reportEvalsAsSymbols: true },
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
          const parent = (linkNode.inLink
                          ? nodeByID[linkNamer(linkNode.link)]
                          : topLevelNode);
          const actualLinkNode = (isLink
                                  ? linkNode
                                  : (isLayoutLink
                                     ? ParseTree.getLayoutLink(linkNode)
                                     : null));
          const implicitNode = extend (
            {
              id: linkNode.graphNodeName,
              pos: linkNode.pos,
              parent: parent,
              nodeType: this.implicitNodeType,
              linkText: ParseTree.getLinkText(actualLinkNode),
              rhs: ParseTree.getLinkTargetRhs(actualLinkNode),
            },
            (isLayoutLink
             ? this.parseCoord (ParseTree.getLayoutCoord(linkNode))
             : {}));
          pushNode (implicitNodes, implicitNode);
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
    const allNodes = realNodes.concat (placeholderNodes);
    let childRank = fromEntries (allNodes.map ((node) => [node.id, {}]));
    allNodes.forEach ((node) => { node.incoming = {}; node.outgoing = {}; node.includeOrder = []; });
    const addEdge = ((edge) => {
      edges.push (edge);
      let sourceNode = nodeByID[edge.source], targetNode = nodeByID[edge.target];
      sourceNode.outgoing[edge.target] = (sourceNode.outgoing[edge.target] || []).concat (edge);
      targetNode.incoming[edge.target] = (targetNode.incoming[edge.source] || []).concat (edge);
      sourceNode.includeOrder.push (targetNode);
      edge.totalIncluded = () => sourceNode.includeOrder.length;
      edge.includeRank = edge.totalIncluded();
      let srcChildRank = childRank[edge.source];
      if (!srcChildRank[edge.target])
	srcChildRank[edge.target] = edge.includeRank;
      return edge;
    });
    allNodes.forEach ((node) => {
      let typeText = null, title = null;
      switch (node.nodeType) {
      case this.externalNodeType:
        typeText = node.id.replace (this.SYM_PREFIX, ParseTree.symChar);
        title = '';
        break;
      case this.placeholderNodeType:
        typeText = ParseTree.traceryChar + node.id + ParseTree.traceryChar;
        title = this.placeholderNodeText;
        break;
      case this.implicitNodeType:
        typeText = this.nodeText (node.linkText);
        title = this.implicitBracery (node.rhs);
        break;
      case this.startNodeType:
        typeText = ParseTree.symChar + symName;
        title = this.nodesText (node.rhs);
        break;
      default:
        typeText = ParseTree.traceryChar + node.id + ParseTree.traceryChar;
        title = this.nodesText (node.rhs);
        break;
      }
      node.type = node.id;
      node.typeText = this.truncate (typeText, this.maxNodeTypeTextLen);
      node.title = this.truncate (title, this.maxNodeTitleLen);
      // Create outgoing include edges
      getIncludedNodes (node)
        .concat (getExternalNodes (node))
        .map ((target) => addEdge ({ source: node.id,
                                     target: target.graphNodeName,
                                     type: mv.includeEdgeType,
                                     pos: target.pos }))
        .map ((edge) => extend (edge,
                                ))
    });
    // Create link edges
    implicitNodes.forEach ((node) => addEdge ({ source: node.parent.id,
                                                target: node.id,
                                                type: mv.linkEdgeType,
                                                parseTreeNode: node }));
    // Common processing for edges
    edges.forEach ((edge) => {
      edge.edgeType = edge.type;  // preserve type against later modification of selected edge type
      if (this.showEdgeRank)
        if (edge.totalIncluded() > 1)
          edge.handleText = edge.includeRank.toString();
    });

    // Create tree structure
    // Ensure every node (except start) has a parent, and sort children by the order that the parent->child edges appear
    // This keeps the automatic hierarchical layout stable when we add placeholders, etc.
    const startNode = allNodes[0];
    let nOrphans = 0;
    allNodes.forEach ((node) => node.children = []);
    allNodes.forEach ((node, n) => {
      if (n > 0) {
        if (!node.parent) {  // if a node is not referenced by any other node, set its parent to be the start node
	  node.parent = startNode;
          childRank[startNode.id][node.id] = startNode.includeOrder.length + (++nOrphans);
        }
	node.parent.children.push (node);
      }
      node.depth = 0;
      for (let n = node; n.parent; n = n.parent)
	++node.depth;
    });
    allNodes.forEach ((node) => {
      node.children.forEach ((child) => { child.childRank = childRank[node.id][child.id] });
      node.children = node.children.sort ((a,b) => a.childRank - b.childRank);
      node.maxChildRank = node.children.length ? node.children[node.children.length-1].childRank : 0;
      node.children.forEach ((child) => { child.relativeChildRank = child.childRank / (node.maxChildRank + 1) });
    });

    // Remove any placeholders or external nodes that don't have incoming edges
    const prunedNodes = allNodes.filter ((node) => ((node.nodeType !== this.placeholderNodeType && node.nodeType !== this.externalNodeType)
                                                    || Object.keys(node.incoming).length));
    
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
    prunedNodes.forEach (layoutNode);

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
    return { nodes: prunedNodes,
	     edges,
             nodeByID,
             text };
  }

  // Event handlers
  onUpdateNode (graph, node) {
    if (node.x !== node.orig.x || node.y !== node.orig.y)
      this.setEvalText (this.rebuildBracery (graph, node));
  }

  onSelectNode (graph, node) {
    this.setSelected (graph,
                      node
                      ? { node: node.id }
                      : {});
  }

  onSelectEdge (graph, edge) {
    this.setSelected (graph,
                      edge
                      ? { edge: { source: edge.source,
                                  target: edge.target } }
                      : {});
  }

  // <textarea> for selected node/edge
  selectionTextArea (graph) {
    this.assertSelectionValid (graph);
    return (<NodeEditor
            setEditorState={this.setEditorState.bind(this,graph,this.selectedNode(graph),this.selectedEdge(graph),this.selectedEdgeSourceNode(graph),this.selectedEdgeTargetNode(graph))}
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
    //    console.warn(graph);
    //    console.warn(selected);
    const nodeTypes = fromEntries (
      graph.nodes.map (
        (node) => [
          node.id,
          ({ shapeId: '#' + node.id,
             typeText: node.typeText,
	     shape: (
                 <symbol viewBox="0 0 25 10" id={node.id} key="0">
                 <rect x="0" y="0" width="25" height="10" className={node.nodeType+'-node'+(node.selected
                                                                                            ?' selected-node'
                                                                                            :(node.selectedOutgoingEdge
                                                                                              ?' selected-edge-source-node'
                                                                                              :(node.selectedIncomingEdge
                                                                                                ?' selected-edge-target-node'
                                                                                                :'')))}></rect>
                 </symbol>
	     )
           })]));
    const edgeTypes = fromEntries (['',this.selectedEdgeTypeSuffix].reduce ((a, selectedSuffix) => a.concat ([
      ['include'+selectedSuffix, {
	shapeId: '#includeEdge'+selectedSuffix,
	shape: (
            <symbol viewBox="0 0 60 60" id={'includeEdge'+selectedSuffix} key="0">
            {/* Commented out because it appears in the wrong orientation when arrow is right-to-left
               <path d="M20 20 h15 q 10 0,10 10 q 0 10,-10 10 h-15 q 3 0,3 -10 q 0 -10,-3 -10 Z" className={'includeEdgeLabel'+selectedSuffix}></path> 
             */}
            </symbol>
	)
      }],
      ['link'+selectedSuffix, {
	shapeId: '#linkEdge'+selectedSuffix,
	shape: (
            <symbol viewBox="0 0 60 60" id={'linkEdge'+selectedSuffix} key="1">
            <circle cx="20" cy="30" r="10" className={'linkEdgeLabel'+selectedSuffix}></circle>
            <circle cx="40" cy="30" r="10" className={'linkEdgeLabel'+selectedSuffix}></circle>
            </symbol>
	)
      }]]), []));
    return (<div>
            <div className="mapview">
	    <GraphView
            nodeKey="id"
	    nodes={graph.nodes}
	    edges={graph.edges}
	    edgeTypes={edgeTypes}
	    nodeTypes={nodeTypes}
	    nodeSubtypes={{}}
            nodeSize={this.nodeSize}
            edgeHandleSize={this.edgeHandleSize}
            edgeArrowSize={this.edgeArrowSize}
            onUpdateNode={(node)=>this.onUpdateNode(graph,node)}
            onSelectNode={(node)=>this.onSelectNode(graph,node)}
            onSelectEdge={(edge)=>this.onSelectEdge(graph,edge)}
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
