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
  escapeTopLevelRegex (text, regex) {
    return ParseTree.parseRhs(text)
      .map ((node) => (typeof(node) === 'string'
                       ? node.replace (regex, (m) => '\\'+m)
                       : this.nodeText(node,text)))
      .join('');
  }
  escapeTopLevelSquareBraces (text) {
    return this.escapeTopLevelRegex (text, /[[\]|\\]/g);
  }
  escapeTopLevelCurlyBraces (text) {
    return this.escapeTopLevelRegex (text, /[{}|\\]/g);
  }
  
  // isLinkShortcut
  isLinkShortcut (text) {
    return text.match(/^\[\[.*\]\]$/);
  }

  // parseCoord
  parseCoord (coord) {
    const xy = coord.split(',');
    return { x: parseFloat (xy[0]),
	     y: parseFloat (xy[1]) };
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

  makeNodeBracery (node, wantImplicit) {
    const x = Math.round(node.x), y = Math.round(node.y);
    switch (node.nodeType) {
    case this.externalNodeType:
      return '&placeholder' + ParseTree.symChar + node.id.replace(this.SYM_PREFIX,'') + '{' + x + ',' + y + '}\n';
    case this.placeholderNodeType:
      return '&placeholder' + ParseTree.varChar + node.id + '{' + x + ',' + y + '}\n';
    case this.startNodeType:
      return '&placeholder{' + x + ',' + y + '}\n';
    case this.definedNodeType:
      return '[' + node.id + '@' + x + ',' + y + '=>' + this.escapeTopLevelSquareBraces (this.nodesText (node.rhs)) + ']\n';
    case this.implicitNodeType:
      if (wantImplicit) {
        const isShortcut = this.isLinkShortcut(this.nodeText(node));
        console.warn('implicit',node);
        return '&link@' + x + ',' + y + '{'
          + this.nodeText(node.linkText)
          + '}{'
          + this.escapeTopLevelCurlyBraces (isShortcut
                                            ? (ParseTree.traceryChar + ParseTree.traceryVarName(node.rhs[0]) + ParseTree.traceryChar)
                                            : this.nodesText(node.rhs))
          + '}';
      }
      return '';
    default:
      return '';
    }
  }

  rebuildBracery (graph, changedNode) {
    // If we're changing an implicit node, then just rewrite the substring.
    // If we're changing a defined or start node (i.e. at the top level of the file), then rebuild the whole string.
    // This is a bit messy but is consistent with the top-level entities being autonomous, with the implicit ones dangling off them
    // (and being able to select smaller and smaller substrings by clicking on implicit nodes).
    if (changedNode.nodeType === this.implicitNodeType) {
      return graph.text.substr (0, changedNode.pos[0])
        + this.makeNodeBracery(changedNode,true)
        + graph.text.substr (changedNode.pos[0] + changedNode.pos[1]);
    } else {
      return graph.nodes.map ((graphNode) => (
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
            : (selected.edge
               ? graph.nodeByID[selected.edge.source]
               : null));
  }

  selectedEdges (graph, selected) {
    selected = selected || this.props.selected;
    return (selected.edge
            ? (graph.nodeByID[selected.edge.source].outgoing[selected.edge.target] || [])
            : null);
  }

  selectedNodeText (graph, selected) {
    const node = this.selectedNode (graph, selected);
    return node ? this.nodesText (node.rhs) : '';
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
    const editorContent = this.selectedNodeText (graph, selected);
    let editorSelection = { startOffset: editorContent.length,
                            endOffset: editorContent.length };
    if (selected.edge) {
      const selectedEdges = this.selectedEdges (graph, selected);
      if (selectedEdges.length === 1)
        editorSelection = this.calculateSelectionRange (this.selectedNode(graph,selected).rhs, selectedEdges[0].pos);
    }
    const editorDisabled = !(selected.node || selected.edge)
          || (selected.node && this.selectedNode(graph,selected).nodeType === this.externalNodeType);
    this.props.setAppState ({ mapSelection: selected,
                              editorContent: editorContent,
                              editorSelection: editorSelection,
                              editorDisabled: editorDisabled,
                              editorFocus: ((selected.node || selected.edge) && !editorDisabled) });
  }

  setEditorState = (graph, selectedNode, newEditorState, callback) => {
    const appProp = { focus: 'editorFocus',
                      content: 'editorContent',
                      selection: 'editorSelection' };
    let newAppState = fromEntries (
      Object.keys(appProp)
        .filter ((prop) => newEditorState.hasOwnProperty(prop))
        .map ((prop) => [appProp[prop], newEditorState[prop]]));
    if (selectedNode && newEditorState.hasOwnProperty('content')) {
      const newNode = extend ({},
                              selectedNode,
                              { rhs: [newEditorState.content],
                                nodeType: (selectedNode.nodeType === this.placeholderNodeType
                                           ? this.definedNodeType
                                           : selectedNode.nodeType) });
      const newGraph = extend ({},
                               graph,
                               { nodes: graph.nodes.map ((node) => (node === selectedNode ? newNode : node)) });
      newAppState.evalText = this.rebuildBracery (newGraph, newNode);
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
    const pushNode = (nodes, node) => { nodeByID[node.id] = node; nodes.push(node); };
    const unshiftNode = (nodes, node) => { nodeByID[node.id] = node; nodes = [node].concat(nodes); };
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
        if (node.nodeType === this.startNodeType)
	  unshiftNode (topLevelNodes, node);
        else
	  pushNode (topLevelNodes, node);
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
      unshiftNode (topLevelNodes, startNode);
    }
    topLevelNodes[0].rhs = startRhs.concat (rhs.slice (nodeOffset));

    // Define some searches of the parse tree
    const getTargetNodes = (node, config, namer) => {
      return ParseTree.getSymbolNodes (node.rhs, config)
        .map ((target) => extend (target, { graphNodeName: namer(target) }))
        .filter ((target) => target.graphNodeName !== node.id);
    };
    const linkNamer = (n) => this.LINK_PREFIX + n.pos[0];
    const getLinkedNodes = (node) => getTargetNodes (node,
                                                     { ignoreSymbols: true,
                                                       ignoreTracery: true,
                                                       reportLinksAsSymbols: true,
                                                       addParentLinkInfo: true },
                                                     linkNamer);
    const getIncludedNodes = (node) => getTargetNodes (node,
                                                       { ignoreSymbols: true,
                                                         ignoreLinkSubtrees: true },
                                                       (n) => n.name);
    const getExternalNodes = (node) => getTargetNodes (node,
                                                       { ignoreTracery: true,
                                                         ignoreLinkSubtrees: true },
                                                       (n) => this.SYM_PREFIX + n.name);

    // Create implicit nodes for links
    let implicitNodes = [];
    topLevelNodes.forEach ((topLevelNode) =>
                           getLinkedNodes(topLevelNode).forEach ((linkNode) => {
                             const implicitNode = extend ({
                               id: linkNode.graphNodeName,
                               pos: linkNode.pos,
                               parent: (linkNode.inLink
                                        ? nodeByID[linkNamer(linkNode.link)]
                                        : topLevelNode),
                               nodeType: this.implicitNodeType,
                               linkText: (ParseTree.isLinkExpr(linkNode)
                                          ? ParseTree.getLinkText(linkNode)
                                          : (ParseTree.isLayoutLinkExpr(linkNode)
                                             ? ParseTree.getLinkText(ParseTree.getLayoutLink(linkNode))
                                             : null)),
                               rhs: (ParseTree.isLinkExpr(linkNode)
                                     ? ParseTree.getLinkTargetRhs(linkNode)
                                     : (ParseTree.isLayoutLinkExpr(linkNode)
                                        ? ParseTree.getLinkTargetRhs(ParseTree.getLayoutLink(linkNode))
                                        : null)),
                             }, (ParseTree.isLayoutLinkExpr(linkNode)
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
    allNodes.forEach ((node) => { node.incoming = {}; node.outgoing = {}; });
    const addEdge = ((edge) => {
      edges.push (edge);
      let sourceNode = nodeByID[edge.source], targetNode = nodeByID[edge.target];
      sourceNode.outgoing[edge.target] = (sourceNode.outgoing[edge.target] || []).concat (edge);
      targetNode.incoming[edge.target] = (targetNode.incoming[edge.source] || []).concat (edge);
      let srcChildRank = childRank[edge.source];
      if (!srcChildRank[edge.target])
	srcChildRank[edge.target] = Object.keys(srcChildRank).length;
    });
    allNodes.forEach ((node) => {
      node.type = node.id;
      node.title = this.truncate ((node.nodeType === mv.externalNodeType
                                   ? ''
                                   : (node.nodeType === mv.placeholderNodeType
                                      ? mv.placeholderNodeText
                                      : (mv.nodesText (node.rhs)
                                         || mv.emptyNodeText))),
                                  this.maxNodeTitleLen);
      // Create outgoing include edges
      getIncludedNodes (node)
        .concat (getExternalNodes (node))
        .forEach ((target) => addEdge ({ source: node.id,
                                         target: target.graphNodeName,
                                         type: mv.includeEdgeType,
                                         pos: target.pos }));
    });
    // Create link edges
    implicitNodes.forEach ((node) => addEdge ({ source: node.parent.id,
                                                target: node.id,
                                                type: mv.linkEdgeType,
                                                pos: node.pos }));

    // Create tree structure
    // Ensure every node (except start) has a parent, and sort children by the order that the parent->child edges appear
    // This keeps the automatic hierarchical layout stable when we add placeholders, etc.
    const startNode = allNodes[0];
    allNodes.forEach ((node) => node.children = []);
    allNodes.forEach ((node, n) => {
      if (n > 0) {
	node.parent = node.parent || startNode;  // if a node is not referenced by any other node, set its parent to be the start node
	node.parent.children.push (node);
      }
      node.depth = 0;
      for (let n = node; n.parent; n = n.parent)
	++node.depth;
    });
    allNodes.forEach ((node) => {
      node.children = node.children.sort ((a,b) => childRank[node.id][a.id] - childRank[node.id][b.id]);
      node.children.forEach ((child, n) => { if (child.parent === node) child.childIndex = n; });
    });

    // Remove any placeholders or external nodes that don't have incoming edges
    const prunedNodes = allNodes.filter ((node) => ((node.nodeType !== this.placeholderNodeType && node.nodeType !== this.externalNodeType)
                                                    || Object.keys(node.incoming).length));
    
    // Lay things out
    const layoutNode = (node) => {
      // If no (x,y) specified, lay out nodes on a circle of radius layoutRadius/2^(depth-1) around the parent node
      if (typeof(node.x) === 'undefined') {
        if (node.parent) {
	  layoutNode (node.parent);
	  const rankOffset = (node.parent.depth ? ((1 - 1/node.parent.children.length)/2) : 0), angleRange = Math.PI * (node.parent.depth ? (1/3) : 2);
	  const angleOffset = (node.parent.depth
			       ? Math.atan2 (node.parent.y - node.parent.parent.y, node.parent.x - node.parent.parent.x)
			       : 0);
	  const angle = angleOffset + angleRange * (node.childIndex / node.parent.children.length + rankOffset);
	  const radius = mv.layoutRadius * Math.pow (mv.layoutRadiusMultiplier, node.depth - 1);
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
    if (selected.node)
      nodeByID[selected.node].selected = true;
    else if (selected.edge) {
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
    return (<NodeEditor
            setEditorState={this.setEditorState.bind(this,graph,this.selectedNode(graph))}
            content={this.props.editorContent}
            selection={this.props.editorSelection}
            disabled={this.props.editorDisabled}
            focus={this.props.editorFocus} />);
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
             typeText: node.id.replace (this.SYM_PREFIX, ParseTree.symChar),
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
            <symbol viewBox="0 0 50 50" id={'includeEdge'+selectedSuffix} key="0">
            <circle cx="25" cy="25" r="8" className={'includeEdge'+selectedSuffix}></circle>
            </symbol>
	)
      }],
      ['link'+selectedSuffix, {
	shapeId: '#linkEdge'+selectedSuffix,
	shape: (
            <symbol viewBox="0 0 100 100" id={'linkEdge'+selectedSuffix} key="1">
            <circle cx="50" cy="50" r="50" className={'linkEdge'+selectedSuffix}></circle>
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
