import { ParseTree } from 'bracery';
import { extend, fromEntries } from './bracery-web';

// ParseGraph
// A graph representation of a Bracery parse tree that
//  - can be passed to react-digraph
//  - knows how to consistently update itself
//  - is readily serializable (no circular references, at least in this.nodes & this.edges)

// TODO. Implement the following actions:

// Edit include edge (replace local text in ancestral node, rebuild ancestor's subgraph)
// Edit link edge (replace local text in ancestral node, replace edge; no rebuild needed)
// Edit node (replace local text in ancestral node, or global if ancestor=self; rebuild ancestor's subgraph)
// Add node
// Add edge
// Swap include edge target
// Swap link edge target
// Delete implicit node, or edge to implicit node (rebuild ancestor's subgraph)
// Delete defined node (and delete its subgraph)
// Delete include edge (equivalent to editing it)
// Delete link edge (equivalent to doing "delete include edge" on it)
// Convert implicit node to defined node
// Duplicate node

class ParseGraph {
  constructor (props) {
    this.ParseTree = ParseTree;
    this.state = this.buildGraphFromParseTree ({ text: props.text,
                                                 rhs: props.rhs,
                                                 name: props.name,
                                                 selected: props.selected });
  }

  // State accessors.
  // The setters can be simple because we're a plain object,
  // not a React component or MobX state tree or whatever.
  get nodes() { return this.state.nodes; }
  get edges() { return this.state.edges; }
  get selected() { return this.state.selected; }

  set nodes (n) { this.state.nodes = n; }
  set edges (e) { this.state.edges = e; }
  set selected (s) { this.state.selected = s; this.unselectAll(); this.markSelected(); }

  // Main build method: constructs graph by analyzing parsed Bracery expression
  buildGraphFromParseTree (props) {
    const { rhs, text, selected, name } = props;

    // Create parse tree analyzer. This object holds useful temporary info & pointers to the parse tree
    const pta = this.newParseTreeAnalyzer (rhs, text, name);
    let { braceryNodeRhsByID } = pta;

    // Scan parse tree for top-level global variable assignments
    const topLevelNodes = this.parseTopLevel (pta);

    // Create implicit nodes for links, and create include & link edges
    let edges = [];
    const implicitNodes = topLevelNodes.reduce ((implicitNodes, topLevelNode) => {
      const subgraph = this.getImplicitNodesAndEdges (topLevelNode, braceryNodeRhsByID[topLevelNode.id], pta);
      edges = edges.concat (subgraph.edges);
      pta.extend (subgraph);
      return implicitNodes.concat (subgraph.implicitNodes);
    }, []);
    const realNodes = topLevelNodes.concat (implicitNodes);

    // Create placeholders for unknown & external nodes
    const placeholderNodes = realNodes.reduce ((nodes, node) => {
      return nodes.concat (this.addPlaceholders (node, braceryNodeRhsByID[node.id], pta));
    }, []);
    const nodesIncludingDetached = realNodes.concat (placeholderNodes);
    const nodes = this.filterOutDetachedNodes (nodesIncludingDetached, edges);

    // Do layout, add styling info
    this.doTreeLayout (nodes, edges, pta);
    this.bridgeNodesToStyles (nodes, pta);

    // Mark selected node/edge
    this.unselectAll (nodes, edges);
    this.markSelected (selected, edges, pta);
    
    // We now have the graph
    return { nodes, edges, selected };
  }

  // Constants
  get newVarPrefix() { return 'scene' }

  get START() { return 'START'; }
  get SYM_PREFIX() { return 'SYM_'; }
  get LINK_SUFFIX() { return '_LINK'; }

  get nodeSize() { return 150; }
  get edgeHandleSize() { return 50; }
  get edgeArrowSize() { return 10; }

  get layoutRadius() { return 300; }

  get maxNodeTypeTextLen() { return 24; }
  get maxNodeTitleLen() { return 24; }

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
			   : this.parseTreeNodeText(node,text)))
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

  // Wrappers for ParseTree.getSymbolNodes that find various types of nodes
  getTargetNodes (rhs, config, namer) {
    return ParseTree.getSymbolNodes (rhs, config)
      .map ((target) => extend (target, { graphNodeName: namer(target) }))
  }

  getLinkedNodes (prefix, rhs) {
    // In these searches we need to auto-name some unnamed nodes.
    // It's generally better if we pick names that are robust to changes in the source text,
    // otherwise we can confuse react-digraph by changing the graph through the UI component
    // in a way that invalidates the component's internal state (by changing node names).
    let nLinkedNodes = 0;
    const linkNamer = (n) => prefix + this.LINK_SUFFIX + (++nLinkedNodes);
    return this.getTargetNodes (rhs,
                                { ignoreSymbols: true,
                                  ignoreTracery: true,
                                  reportLinks: true,
                                  addParentLinkInfo: true },
                                linkNamer);
  }

  getIncludedNodes (rhs) {
    return this.getTargetNodes (rhs,
                                { ignoreSymbols: true,
                                  ignoreLinkSubtrees: true,
                                  reportEvals: true },
                                (n) => ParseTree.isEvalVar(n) ? ParseTree.getEvalVar(n) : n.name);
  }
  
  getExternalNodes (rhs) {
    return this.getTargetNodes (rhs,
                                { ignoreTracery: true,
                                  ignoreLinkSubtrees: true },
                                (n) => this.SYM_PREFIX + n.name);
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
  
  // parseTreeNodeText is to be called on a Bracery parse tree node,
  // along with the text that was parsed.
  parseTreeNodeText (node, text) {
    if (typeof(text) === 'undefined')
      throw new Error ('parse text undefined');
    return (typeof(node) === 'string'
            ? node
            : (node && node.pos
               ? text.substr (node.pos[0], node.pos[1])
               : ''));
  }

  // parseTreeNodesText is to be called on an array of Bracery parse tree nodes (i.e. an "rhs", in Bracery terminology),
  // along with the text that was parsed.
  parseTreeNodesText (nodes, text) {
    return nodes.reduce ((pre, node) => pre + this.parseTreeNodeText (node, text), '') || '';
  }

  // parseTreeRhsTextOffset is a wrapper for parseTreeNodesText that deals with the syntactic sugar
  // [abc=>x|y|z] for $abc=&quote{[x|y|z]}, restoring the enclosing square braces.
  // It also handles the case where rhs is enclosed by curly braces (which we don't want to include).
  // In the returned object, text is (derived from) the substring of origText corresponding to rhs,
  // and offset is such that text.charAt(offset+N) === origText.charAt(N) (for shared positions).
  parseTreeRhsTextOffset (rhs, rhsParentNode, origText) {
    const text = this.parseTreeNodesText (rhs, origText);
    const offset = (rhsParentNode && rhsParentNode.pos) ? rhsParentNode.pos[0] : 0;
    return (this.parseTreeRhsIsAlternation(rhs)  // x|y|z
            ? { text: (ParseTree.leftSquareBraceChar + text + ParseTree.rightSquareBraceChar),  // [x|y|z]
                offset: offset - 1 }
            : { text: text,
                offset: offset + (origText.charAt(offset) === ParseTree.leftBraceChar
                                  && origText.charAt(offset) !== text.charAt(0)
                                  ? 1
                                  : 0) });
  }

  parseTreeRhsIsAlternation (rhs) {
    return rhs.length === 1 && typeof(rhs[0]) === 'object' && rhs[0].type === 'alt';
  }

  // Text for a graph entity
  getPosSubstr (text, pos) {
    return (text && pos
            ? text.substr (pos[0], pos[1])
            : '');
  }

  // Text for a graph node, or substring associated with a node (pos is optional, defaults to node pos)
  nodeText (nodeByID, node, pos) {
    if (node.defText && !pos)
      return node.defText;
    let ancestor = this.getAncestor (nodeByID, node);
    return this.getPosSubstr (ancestor.defText, pos || node.pos);
  }

  getAncestor (nodeByID, node) {
    return node.topLevelAncestorID ? nodeByID[node.topLevelAncestorID] : node;
  }
  
  // Text for a graph edge
  edgeText (nodeByID, edge) {
    let source = nodeByID[edge.source];
    let ancestor = this.getAncestor (nodeByID, source);
    return this.getPosSubstr (ancestor.defText, edge.linkTextPos || edge.pos);
  }

  // Detect if a graph node is another node's ancestor
  nodeInSubtree (node, subtreeRoot, layoutParent) {
    while (node) {
      if (node.id === subtreeRoot.id)  // compare IDs not nodes themselves, as we do a fair bit of object cloning
	return true;
      node = layoutParent[node.id];
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

  // makeNodeBracery - regenerate the Bracery for a graph node,
  // overriding the (X,Y) coordinates with whatever is in the graph,
  // and using syntactic sugar for the &layout, &link, and &placeholder functions,
  // i.e. [name@X,Y=>definition...] and so on.
  makeNodeBracery (node) {
    const xy = this.makeCoord(node);
    switch (node.nodeType) {
    case this.externalNodeType:
      return xy && (xy + ParseTree.symChar + node.id.replace(this.SYM_PREFIX,'') + '\n');
    case this.placeholderNodeType:
      return xy && (xy + ParseTree.varChar + node.id + '\n');
    case this.startNodeType:
      return (xy ? (xy + ':START\n') : '') + node.defText;
    case this.definedNodeType:
      return '[' + node.id + xy + '=>' + this.escapeTopLevelBraces (node.defText, { stripBracketsFromAlt: true }) + ']\n';
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

  // bracery - regenerate entire Bracery string.
  bracery() {
    return this.nodes.slice(1).concat(this.nodes[0]).reduce ((s, node) => s + this.makeNodeBracery(node),'');
  }

  // Various methods for working with the representation of the current selection (node or edge)
  selectedNode (selected) {
    selected = selected || this.state.selected;
    return (selected.node
            ? this.nodes.find ((node) => node.id === selected.node)
            : null);
  }

  selectedNodeText (selected, node) {
    node = node || this.selectedNode (selected);
    return node.defText || '';
  }

  selectedEdges (selected) {
    selected = selected || this.state.selected;
    return (selected.edge
            ? this.edges.filter ((edge) => (edge.source === selected.edge.source
                                             && edge.target === selected.edge.target))
            : null);
  }

  selectedEdge (selected) {
    const edges = this.selectedEdges(selected);
    return edges && edges.length && edges[0];
  }

  selectedEdgeSourceNode (selected) {
    selected = selected || this.state.selected;
    return (selected.edge
            ? this.findNodeByID (selected.edge.source)
            : null);
  }

  selectedEdgeLinkNode (selected) {
    selected = selected || this.state.selected;
    return (selected.edge
            ? this.findNodeByID (selected.edge.target)
            : null);
  }

  // calculateSelectionRange converts a ParseGraph-style pos=[start,len] tuple to an HTML-style {startOffset,endOffset}
  calculateSelectionRange (pos) {
    return { startOffset: pos[0],
	     endOffset: pos[0] + pos[1] };
  }

  // Graph-indexing helpers
  getEdgesByNode (edges) {
    let incoming = {}, outgoing = {};
    edges.forEach ((edge, n) => {
      const pushEdgeIndex = (obj, prop) => {
        obj[prop] = (obj[prop] || []).concat ([n]);
      };
      pushEdgeIndex (incoming, edge.target);
      pushEdgeIndex (outgoing, edge.source);
    });
    return { incoming, outgoing };
  }

  getNodesByID (nodes) {
    return fromEntries ((nodes || this.nodes).map ((node) => [node.id, node]));
  }

  findNodeByID (id) {
    return this.nodes.find ((node) => node.id === id);
  }
  

  // Graph-building helpers
  addEdge (edges, edge, childRank) {
    if (edge.source === edge.target)  // No self-looping edges allowed. react-digraph won't display them anyway
      return null;
    edges.push (edge);
    let { outgoing } = this.getEdgesByNode (edges);
    edge.includeRank = outgoing[edge.source].length + 1;
    if (childRank) {
      let srcChildRank = childRank[edge.source];
      if (!srcChildRank[edge.target])
	srcChildRank[edge.target] = edge.includeRank;
    }
    edge.edgeType = edge.type;  // preserve type against later modification of selected edge type
    return edge;
  }

  // Helper pseudo-class for parse tree analysis
  newParseTreeAnalyzer (rhs, text, symName) {
    let nodeByID = {}, braceryNodeRhsByID = {};
    const pushNode = (nodes, node, parseTreeNode, parseTreeNodeRhs, config) => {
      nodeByID[node.id] = node;
      braceryNodeRhsByID[node.id] = parseTreeNodeRhs || [];
      // Push or unshift the node to the given list of nodes
      if (config && config.insertAtStart)
        nodes.splice(0,0,node);
      else
        nodes.push(node);
    };
    let pta = { rhs,
                text,
                symName,
                nodeByID,
                braceryNodeRhsByID,
                pushNode,
                braceryNodeOffset: {},
                layoutParent: {},
                childRank: {},
              };
    pta.extend = (subgraph) => Object.keys(pta)
      .filter ((prop) => subgraph.hasOwnProperty(prop))
      .forEach ((prop) => extend (pta[prop], subgraph[prop]));
    return pta;
  }

  // Get subgraph corresponding to a Bracery expression
  getImplicitNodesAndEdges (topLevelNode, rhs, pta) {
    let { text, nodeByID, layoutParent, braceryNodeOffset, pushNode, braceryNodeRhsByID } = pta;
    let implicitNodes = [], edges = [];
    braceryNodeRhsByID[topLevelNode.id] = rhs;
    this.getLinkedNodes (topLevelNode.id, rhs)
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
        const linkBracery = this.parseTreeNodeText (actualLinkNode, text);
        const linkIsShortcut = this.isLinkShortcut (linkBracery);
        const linkTextNode = ParseTree.getLinkText (actualLinkNode);
        const linkTargetRhs = ParseTree.getLinkTargetRhs (actualLinkNode);
        const linkTargetRhsNode = ParseTree.getLinkTargetRhsNode (actualLinkNode);
        const linkTargetTextOffset = this.parseTreeRhsTextOffset (linkTargetRhs, linkTargetRhsNode, text);
        let uniqueTarget = null, defText = linkTargetTextOffset.text;
        if (linkTargetRhs.length === 1) {
          const linkTargetNode = linkTargetRhs[0];
          if (ParseTree.isEvalVar(linkTargetNode)) {
            uniqueTarget = ParseTree.getEvalVar(linkTargetNode);
          } else if (linkTargetNode.type === 'sym') {
            uniqueTarget = this.SYM_PREFIX + linkTargetNode.name;
          } else if (ParseTree.isTraceryExpr(linkTargetNode)) {
            uniqueTarget = ParseTree.traceryVarName (linkTargetNode);;
            defText = this.makeTraceryText (linkTargetRhs);
          }
        }
        const topOffset = braceryNodeOffset[topLevelNode.id] || 0;
        const implicitNodeID = linkNode.graphNodeName;
        braceryNodeOffset[implicitNodeID] = linkTargetTextOffset.offset;
        layoutParent[implicitNodeID] = parent;
        const implicitNode = extend (
          {
            id: implicitNodeID,
            pos: [linkNode.pos[0] - topOffset,
                  linkNode.pos[1]],
            topLevelAncestorID: topLevelNode.id,
            nodeType: this.implicitNodeType,
            linkTextPos: [linkTextNode.pos[0] + (linkIsShortcut ? 2 : 1) - topOffset,
                          linkTextNode.pos[1] - (linkIsShortcut ? 4 : 2)],  // strip braces from &link{...}
            defText: defText,
          },
          uniqueTarget ? {uniqueTarget} : {},
          (isLayoutLink
           ? this.parseCoord (ParseTree.getLayoutCoord (linkNode))
           : {}));
//          console.warn(implicitNode);
        pushNode (implicitNodes, implicitNode, linkNode, linkTargetRhs);
      });
    
    // Create include & link edges
    const realNodes = [topLevelNode].concat (implicitNodes);
    let childRank = fromEntries (realNodes.map ((node) => [node.id, {}]));
    const addEdge = (edge) => { this.addEdge (edges, edge, childRank); };
    realNodes.forEach ((node) => {
      // Create outgoing include edges from every node
      if (!node.uniqueTarget) {
        const srcOffset = braceryNodeOffset[node.id];
        const nodeRhs = braceryNodeRhsByID[node.id];
        this.getIncludedNodes (nodeRhs)
          .concat (this.getExternalNodes (nodeRhs))
          .map ((target) => addEdge ({ source: node.id,
                                       target: target.graphNodeName,
                                       type: this.includeEdgeType,
                                       pos: [target.pos[0] - srcOffset,
                                             target.pos[1]] }))
      }
    });

    // Create link edges for every implicit node
    implicitNodes.forEach ((node) => addEdge (extend ({ source: layoutParent[node.id].id,
                                                        type: this.linkEdgeType,
                                                        pos: node.pos,
							linkTextPos: node.linkTextPos },
                                                      (node.uniqueTarget
                                                       ? { target: node.uniqueTarget,
                                                           link: node.id }
                                                       : { target: node.id }))));

    // Return
    return { implicitNodes, edges, braceryNodeOffset, braceryNodeRhsByID, layoutParent, childRank, nodeByID };
  }

  // Create placeholders for unknown & external nodes
  addPlaceholders (node, rhs, pta) {
    let { nodeByID, layoutParent, pushNode } = pta;
    let placeholderNodes = [];
    const createPlaceholders = (nodes, attrs) => {
      nodes.forEach ((target) => {
	const targetNode = nodeByID[target.graphNodeName];
        if (targetNode) {
	  if (!layoutParent[targetNode.id]
              && targetNode.nodeType !== this.startNodeType
              && !this.nodeInSubtree (node, targetNode, layoutParent))
	    layoutParent[targetNode.id] = node;
	} else {
	  const newNode = extend ({ id: target.graphNodeName },
				  attrs);
          layoutParent[newNode.id] = node;
          pushNode (placeholderNodes, newNode);
        }
      });
    }
    createPlaceholders (this.getIncludedNodes(rhs), { nodeType: this.placeholderNodeType });
    createPlaceholders (this.getExternalNodes(rhs), { nodeType: this.externalNodeType });

    return placeholderNodes;
  }

  filterOutDetachedNodes (nodes, edges) {
    // Remove any placeholders, implicit, or external nodes that don't have incoming or outgoing edges
    const { incoming, outgoing } = this.getEdgesByNode (edges);
    const nodeDetached = (node) => ((node.nodeType === this.placeholderNodeType
                                     || node.nodeType === this.externalNodeType
                                     || node.nodeType === this.implicitNodeType)
                                    && !(incoming[node.id] && incoming[node.id].length)
                                    && !(outgoing[node.id] && outgoing[node.id].length));
    return nodes.filter ((node) => !nodeDetached(node));
  }

  doTreeLayout (nodes, edges, pta) {
    // Create layout tree structure
    // - Ensure every node (except start) has a parent.
    // - If a node's parent is a skipped implicit node (i.e. an implicit node with a unique target),
    //   then set the node's parent to its grandparent; repeat until the parent is not a skipped implicit node.
    // - Sort children by the order that the parent->child edges appear.
    //   This keeps the automatic hierarchical layout stable when we add placeholders, etc.
    let { layoutParent, childRank, nodeByID } = pta;
    const { outgoing } = this.getEdgesByNode (edges);
    const startNode = nodes[0];
    let nOrphans = 0;
    let layoutChildren = fromEntries (nodes.map ((node) => [node.id, []]));
    let layoutDepth = fromEntries (nodes.map ((node) => [node.id, 0]));
    nodes.forEach ((node, n) => {
      if (n > 0) {
        if (!layoutParent[node.id]) {  // if a node is not referenced by any other node, set its parent to be the start node
	  layoutParent[node.id] = startNode;
          if (typeof(node.x) === 'undefined')
            childRank[startNode.id][node.id] = (outgoing[startNode.id] || []).length + (++nOrphans);
        }
        while (layoutParent[node.id].uniqueTarget)
          layoutParent[node.id] = layoutParent[layoutParent[node.id].id];
        let parent = layoutParent[node.id];
	layoutChildren[parent.id].push (node);
      }
      for (let n = node; layoutParent[n.id]; n = layoutParent[n.id]) {
//        console.warn(n,node);
	++layoutDepth[node.id];
      }
    });

    let nodeChildRank = {}, maxChildRank = {}, relativeChildRank = {};
    nodes.forEach ((parent) => layoutChildren[parent.id].forEach ((child) => {
      nodeChildRank[child.id] = childRank[parent.id][child.id];
    }));
    nodes.forEach ((node) => {
      layoutChildren[node.id] = layoutChildren[node.id].sort ((a,b) => nodeChildRank[a.id] - nodeChildRank[b.id]);
      maxChildRank[node.id] = layoutChildren[node.id].reduce ((max, c) => (!nodeByID[c.id] || typeof(nodeChildRank[c.id]) === 'undefined') ? max : Math.max (max, nodeChildRank[c.id]), 0);
      layoutChildren[node.id].forEach ((child) => { relativeChildRank[child.id] = nodeChildRank[child.id] / (maxChildRank[node.id] + 1) });
    });
    
    // Lay things out
    const layoutNode = (node) => {
      // If no (x,y) specified, lay out nodes from the parent node
      if (typeof(node.x) === 'undefined') {
        const parent = layoutParent[node.id];
        if (parent) {
	  layoutNode (parent);
	  const angleRange = Math.PI, angleOffset = -angleRange/2;
	  const angle = angleOffset + angleRange * relativeChildRank[node.id];
	  const radius = this.layoutRadius;
	  node.x = parent.x + Math.cos(angle) * radius;
	  node.y = parent.y + Math.sin(angle) * radius;
        } else
          node.x = node.y = 0;
      }
      node.orig = { x: node.x, y: node.y };
    };
    nodes.forEach (layoutNode);
  }

  bridgeNodesToStyles (nodes, pta) {
    let { nodeByID } = pta;
    // react-digraph has an awkward enforced separation between nodes and styling information,
    // that we have to bridge.
    // The 'typeText' and 'title' fields correspond to what would more commonly be called 'title' & 'subtitle'.
    // However, while a 'title' (i.e. subtitle) can be specified at the node level,
    // the 'typeText' (i.e. title) must be specified in the styling information.
    nodes.forEach ((node) => {
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
        typeText = this.nodeText (nodeByID, node, node.linkTextPos);
        title = this.nodeText (nodeByID, node, node.linkTargetPos);
        break;
      case this.startNodeType:
        typeText = ParseTree.symChar + pta.symName + ' ';
        title = node.defText;
        break;
      default:
        typeText = ParseTree.traceryChar + node.id + ParseTree.traceryChar;
        title = node.defText;
        break;
      }
      node.styleInfo = { typeText: this.truncate (typeText, this.maxNodeTypeTextLen) };  // pass info to the nodeTypes
      node.type = node.id;  // required by react-digraph to match this node to the correct (unique, in our case) nodeType
      node.title = this.truncate (title, this.maxNodeTitleLen);  // required by react-digraph to display the (sub)title
    });
  }

  // Scan parsed Bracery code for top-level global variable assignments,
  // of the form $variable=&quote{...} or $variable=&layout{x,y}&quote{...}
  parseTopLevel (pta) {
    let { symName, rhs, text, nodeByID, braceryNodeOffset, braceryNodeRhsByID, pushNode } = pta;
    const startNodeID = this.SYM_PREFIX + symName;
    let topLevelNodes = [], startDefText = '';
    // We will not keep these references to the originally parsed text and the Bracery parse tree,
    // but we use them for analysis when building the graph
    let startOffset = 0, rhsOffset = 0, braceryStartNodeRhs = [];
    // Loop through top-level nodes
    while (rhsOffset < rhs.length) {
      let braceryNode = rhs[rhsOffset], braceryDefNode = null, braceryNodeRhs = [];
      if (ParseTree.isQuoteAssignExpr (braceryNode)  // [var=>...]
          || ParseTree.isLayoutAssign (braceryNode)  // [var@x,y=>...]
          || ParseTree.isPlaceholderExpr (braceryNode)) {  // @x,y$var or @x,y~var
        let node = {};
	let coord = null;
        if (ParseTree.isPlaceholderExpr (braceryNode)) {  // @x,y$var or @x,y~var
	  const heldNode = ParseTree.getPlaceholderNode (braceryNode);
	  const heldNodeType = heldNode && heldNode.type;
	  coord = ParseTree.getPlaceholderCoord (braceryNode);
	  if (heldNodeType === 'lookup') {
	    node.id = heldNode.varname;
	    node.nodeType = this.placeholderNodeType;
	  } else if (heldNodeType === 'sym') {
	    node.id = this.SYM_PREFIX + heldNode.name;
	    node.nodeType = this.externalNodeType;
	  } else {
	    node.id = startNodeID;
	    node.nodeType = this.startNodeType;
	  }
        } else {
          // [var@x,y=>...] or [var=>...]
	  node.id = braceryNode.varname.toLowerCase();
          node.nodeType = this.definedNodeType;
	  if (ParseTree.isLayoutAssign (braceryNode)) {  // [var@x,y=>...]
	    let expr = ParseTree.getLayoutExpr (braceryNode);
	    coord = ParseTree.getLayoutCoord (expr);
            braceryDefNode = ParseTree.getLayoutContentNode (expr);
	    braceryNodeRhs = ParseTree.getLayoutContent (expr);
	  } else {  // [var=>...]
            braceryDefNode = ParseTree.getQuoteAssignRhsNode (braceryNode);
	    braceryNodeRhs = ParseTree.getQuoteAssignRhs (braceryNode);
          }
        }
        if (coord)
          extend (node, this.parseCoord (coord))
        topLevelNodes = topLevelNodes.filter ((n) => n.id !== node.id);
        const defTextOffset = this.parseTreeRhsTextOffset (braceryNodeRhs, braceryDefNode, text);
        extend (node, { defText: defTextOffset.text });
        braceryNodeOffset[node.id] = defTextOffset.offset;
	pushNode (topLevelNodes,
		  node,
		  braceryNode,
		  braceryNodeRhs,
		  { insertAtStart: node.nodeType === this.startNodeType });
	startOffset = braceryNode.pos[0] + braceryNode.pos[1];
      } else if (this.isStaticExpr ([braceryNode])) {
	braceryStartNodeRhs.push (braceryNode);
        startDefText += text.substr (braceryNode.pos[0], braceryNode.pos[1]);
	startOffset = (typeof(braceryNode) === 'string'
		       ? braceryNode.length
		       : (braceryNode.pos[0] + braceryNode.pos[1]));
      } else {
        break;
      }
      ++rhsOffset;
    }

    // Add a start node for everything that is *not* part of a top-level global variable assignment
    if (!nodeByID[startNodeID]) {
      const startNode = { id: startNodeID,
                          nodeType: this.startNodeType };
      pushNode (topLevelNodes,
		startNode,
		null,
		braceryStartNodeRhs,
		{ insertAtStart: true });
    }
    let startNode = topLevelNodes[0];
    if (startOffset < text.length) {
      braceryNodeOffset[startNodeID] = startOffset - startDefText.length;
      startDefText += text.slice (startOffset);
      braceryNodeRhsByID[startNodeID] = braceryNodeRhsByID[startNodeID].concat (rhs.slice (rhsOffset));
    }
    startNode.defText = startDefText;

    return topLevelNodes;
  }

  unselectAll (nodes, edges) {
    nodes = nodes || this.nodes;
    edges = edges || this.edges;
    nodes.forEach ((node) => { delete node.selectedOutgoingEdge; delete node.selectedIncomingEdge; delete node.selected; });
    (
      (regex) => edges.forEach ((edge) => { delete edge.selected; edge.type = edge.type.replace (regex, ''); })
    ) (new RegExp (this.selectedEdgeTypeSuffix + '$', 'g'));
  }

  markSelected (selected, edges, pta) {
    selected = selected || this.selected;
    edges = edges || this.edges;
    const { nodeByID } = pta || { nodeByID: this.getNodesByID() };
    // Mark selected node/edge
    if (selected.node && nodeByID[selected.node])
      nodeByID[selected.node].selected = true;
    else if (selected.edge
             && nodeByID[selected.edge.source]
             && nodeByID[selected.edge.target]) {
      edges
        .filter ((edge) => edge.source === selected.edge.source)
        .filter ((edge) => edge.target === selected.edge.target)
        .forEach ((edge) => {
          edge.selected = true;
          edge.type += this.selectedEdgeTypeSuffix;
        });
      nodeByID[selected.edge.source].selectedOutgoingEdge = true;
      nodeByID[selected.edge.target].selectedIncomingEdge = true;
    }
  }
}

export default ParseGraph;
