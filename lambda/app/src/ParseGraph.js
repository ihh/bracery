import { ParseTree } from 'bracery';
import { extend, fromEntries } from './bracery-web';

// ParseGraph
// A graph representation of a Bracery parse tree that
//  - can be passed to react-digraph
//  - knows how to consistently update itself
//  - is readily serializable (no circular references, at least in this.nodes & this.edges)

// TODO:
// Simplify edge banner
// Name node (link, convert implicit node to defined node with new var name)
// Duplicate node

// Preserve state in localStorage
// Save slider button (publish to server using username/symbol format)
// User preference: by default, all pages start off unlocked (i.e. can be edited by any user)
// (guest account has this preference checked; key pages like guest/welcome can then be locked again)
// Users can only lock pages in their own namespace, but can fork pages in others' namespaces.
// When queried for 'symbol' (without a namespace),
// the server first looks for username/symbol (if the user is logged in), then guest/symbol.
// Users can make symbols private (must be logged in to GET).

class ParseGraph {
  constructor (props) {
    this.ParseTree = ParseTree;
    this.state = this.buildGraphFromParseTree ({ text: props.text,
                                                 rhs: props.rhs || ParseTree.parseRhs (props.text),
                                                 name: props.name,
                                                 selected: props.selected });
    this.symName = props.name;
  }

  // State accessors.
  // The setters can be simple because we're a plain object,
  // not a React component or MobX state tree or whatever.
  get nodes() { return this.state.nodes; }
  get edges() { return this.state.edges; }
  get selected() { return this.state.selected; }

  set nodes (n) { this.state.nodes = n; }
  set edges (e) { this.state.edges = e; }
  set selected (s) { this.state.selected = s; this.clearSelected(); this.markSelected(); }
  
  // Constants
  get newVarPrefix() { return 'scene' }

  get START() { return 'START'; }
  get SYM_PREFIX() { return 'SYM_'; }
  get LINK_SUFFIX() { return '_LINK'; }
  get SLASH_MARKER() { return '_SLASH_'; }

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
  get implicitNodeTitle() { return 'unnamed'; }
  get emptyNodeText() { return ' '; }

  get includeEdgeType() { return 'include'; }
  get linkEdgeType() { return 'link'; }

  get selectedEdgeTypeSuffix() { return 'Selected'; }
  get highlightedEdgeTypeSuffix() { return 'Highlighted'; }

  // Main build method: constructs graph (or rooted subgraph) by analyzing parsed Bracery expression
  buildGraphFromParseTree (props) {
    const { rhs, text, name, selected, root, existingNodes, deletedNodes } = props;

    // Create parse tree analyzer. This object holds useful temporary info & pointers to the parse tree
    const pta = this.newParseTreeAnalyzer (rhs, text, name, existingNodes);
    let { braceryNodeRhsByID } = pta;
    if (root)
      braceryNodeRhsByID[root.id] = rhs;

    // Scan parse tree for top-level global variable assignments
    // (unless we have been called at a specified root)
    const topLevelNodes = root ? [root] : this.parseTopLevel(pta);

    // Collect variable names
    topLevelNodes.forEach ((node) => { node.symAndVarNames = this.symAndVarNames (braceryNodeRhsByID[node.id]); });
    
    // Create implicit nodes for links, and create include & link edges
    let edges = [];
    const implicitNodes = topLevelNodes.reduce ((implicitNodes, topLevelNode) => {
      const subgraph = this.makeImplicitNodesAndEdges (topLevelNode, topLevelNode, braceryNodeRhsByID[topLevelNode.id], pta);
      edges = edges.concat (subgraph.edges);
      pta.extend (subgraph);
      return implicitNodes.concat (subgraph.implicitNodes);
    }, []);
    const realNodes = topLevelNodes.concat (implicitNodes);

    // Create placeholders for unknown & external nodes
    const placeholderNodes = realNodes.reduce ((nodes, node) => {
      return nodes.concat (this.makePlaceholders (node, braceryNodeRhsByID[node.id], pta));
    }, []);
    const nodesIncludingDetached = realNodes.concat (placeholderNodes);
    const nodes = this.filterOutDetachedNodes (nodesIncludingDetached, edges, pta);

    // Do layout, add styling info
    this.doTreeLayout (nodes, edges, pta, deletedNodes);
    this.bridgeNodesToStyles (nodes, pta);

    // Mark selected node/edge
    this.clearSelected (nodes, edges);
    this.markSelected (selected, edges, pta);
    
    // We now have the graph
    return { nodes, edges, selected };
  }

  // Actions
  // Create a node
  createNode (x, y) {
    const id = this.newVar();
    let newNode = extend ({ id: id,
                            type: id,
                            nodeType: this.definedNodeType,
                            x: Math.round(x),
                            y: Math.round(y),
                            styleInfo: { typeText: id },
                            title: this.emptyNodeText,
                            defText: '',
                          });
    this.nodes.push (newNode);
    return newNode;
  }

  // Can we create an edge?
  canCreateEdge (source, target) {
    if (!target) {
      source = typeof(source) === 'object' ? source : this.findNodeByID (source);
      return source && source.nodeType !== this.placeholderNodeType && source.nodeType !== this.externalNodeType;
    }
    return target.nodeType !== this.implicitNodeType;
  }

  // Create an edge
  createEdge (source, target) {
    let link = null;
    if (target.nodeType === this.externalNodeType || target.nodeType === this.startNodeType) {
      const sym = this.nodeIdToSymbol (target.id);
      link = this.makeMarkdownStyleLink (null, this.removeUserPrefix(sym), ParseTree.symChar + sym);
    } else
      link = this.makeTwineStyleLink (target.id);

    const sourceNode = this.findNodeByID (source.id);
    this.replaceNodeText (sourceNode, sourceNode.defText + '\n' + link);
  }

  // Can we swap an edge target?
  canSwapEdge (source, target, edge) {
    return target.nodeType !== this.implicitNodeType
      && this.findNodeByID(edge.target).nodeType !== this.implicitNodeType;
  }
  
  // Swap an edge target
  swapEdge (source, target, edge) {
    if (edge.edgeType === this.linkEdgeType)
      this.swapLinkEdge (source, target, edge);
    else
      this.swapIncludeEdge (source, target, edge);
    this.selected = { edge: { source, target } };
  }

  swapIncludeEdge (source, target, edge) {
    this.replaceIncludeEdgeText (edge, this.makeLinkTargetBracery (target));
  }

  swapLinkEdge (source, target, edge) {
    this.replaceLinkEdgeTarget (edge, target);
  }

  // Can we delete a node?
  canDeleteNode (id, nodeByID) {
    const node = this.findNodeByID (id, nodeByID);
    return node && node.nodeType !== this.startNodeType;
  }

  nodeIsDetached (id) {
    return this.incomingEdges(id).length === 0;
  }

  // Delete a node
  deleteNode (id) {
    let nodeByID = this.getNodesByID();
    let node = nodeByID[id];
    this.deleteSubgraph (node, nodeByID);
    this.nodes = this.nodes.filter ((n) => n.id !== id);
    this.edges = this.edges.filter ((e) => e.source !== id);
    this.deleteEdges ({ target: id }, nodeByID);
    this.removeDetached (nodeByID);
  }

  // Can we rename a node?
  canRenameNode (oldID, newID, nodeByID) {
    oldID = oldID.toLowerCase();
    newID = newID && newID.toLowerCase();
    nodeByID = nodeByID || this.getNodesByID();
    const node = nodeByID[oldID];
    return node
      && (node.nodeType === this.definedNodeType || node.nodeType === this.placeholderNodeType)
      && (!newID || (!this.isVarName()[newID] && !nodeByID[newID]));
  }

  // Rename a node (or, more generally, a variable)
  renameNode (oldID, newID, nodeByID) {
    oldID = oldID.toLowerCase();
    newID = newID.toLowerCase();
    nodeByID = nodeByID || this.getNodesByID();

    // Rename all edge objects
    const renameGraphNode = (oldID, newID) => {

      // Find and rename the node object
      let renamedNode = nodeByID[oldID];
      delete nodeByID[oldID];
      nodeByID[newID] = renamedNode;

      // Generic replacer
      const replaceProp = (obj, prop) => {
	if (obj[prop] === oldID)
	  obj[prop] = newID;
      };

      // Replace IDs
      replaceProp (renamedNode, 'id');
      this.nodes.forEach ((node) => { replaceProp (node, 'topLevelAncestorID'); });

      // Rename edge sources & targets
      this.edges.forEach ((edge) => {
	replaceProp (edge, 'source');
	replaceProp (edge, 'target');
      });

      // Rename the selection
      if (this.selected.node)
	replaceProp (this.selected, 'node');
      else if (this.selected.edge) {
	replaceProp (this.selected.edge, 'source');
	replaceProp (this.selected.edge, 'target');
      }
    };

    // Rename the node, and any implicit nodes that have its name as a prefix
    let renamedNode = nodeByID[oldID];
    renameGraphNode (oldID, newID);
    this.nodes
      .filter ((node) => node.topLevelAncestorID === oldID)
      .forEach ((descendant) => renameGraphNode (descendant.id, descendant.id.replace (oldID, newID)));

    // Rename all references, crawling the Bracery parse tree for each definedNode (and the startNode)
    this.nodes
      .filter ((node) => (node.nodeType === this.definedNodeType || node.nodeType === this.startNodeType))
      .forEach ((node) => {
	let text = node.defText;
	const rhs = ParseTree.parseRhs (text);
	// Find replacement locations and sort by increasing startpoint
	const replacements = this.getVarNodes (rhs, oldID)
	      .map ((varNode) => (varNode.isShortcut
				  ? { pos: varNode.pos,
				      newText: this.makeMarkdownStyleLink (null,
									   this.getPosSubstr (text, this.getLinkTextPos (varNode, text)),
									   this.makeLinkTargetBracery (renamedNode))
				    }
				  : (ParseTree.isTraceryExpr(varNode)
				     ? { pos: varNode.pos,
					 newText: this.makeLinkTargetBracery (renamedNode)
				       }
				     : { pos: varNode.varpos,
					 newText: newID })))
	      .filter ((r) => r.pos && r.pos[1])
	      .sort ((a, b) => a.pos[0] - b.pos[0]);
	// Check that replacement locations do not overlap, that would be bad
	replacements.forEach ((r, n) => {
	  if (n) {
	    const prev = replacements[n-1];
	    if (r.pos[0] < prev.pos[0] + prev.pos[1]) {
	      console.error (text, rhs, this.getVarNodes(rhs,oldID), replacements);
	      throw new Error ('overlapping replacements');
	    }
	  }
	})
	// Apply the replacements efficiently in reverse order
	const newDefText = replacements
	      .reverse()
	      .concat ({ pos: [0, 0], newText: '' })
	      .reduce (
		(info, rep) => {
		  const endOffset = rep.pos[0] + rep.pos[1];
		  const result = { suffix: rep.newText + text.substr (endOffset, info.startOffset - endOffset) + info.suffix,
				   startOffset: rep.pos[0] };
		  return result;
		},
		{ suffix: '',
		  startOffset: text.length }
	      ).suffix;
	// Store the new node text
	this.replaceNodeText (node, newDefText);
      });

    // Update the node styles (just to update the buried type & styleInfo.typeText properties)
    this.bridgeNodesToStyles();
  }
  
  
  // Remove detached nodes
  // Generally we call this after "delete" operations, but not generic edit operations that happen to delete nodes
  // (e.g. editing, edge target-swapping)
  removeDetached (nodeByID) {
    this.nodes = this.filterOutDetachedNodes (this.nodes,
                                              this.edges,
                                              { nodeByID });
  }
  
  // Can we delete an edge?
  canDeleteEdge (edge) {
    return true;
  }

  // Delete edges
  // The edge can be partially specified (target only),
  // in which case we'll delete all the edges that match. Beware.
  deleteEdges (edge, nodeByID) {
    nodeByID = nodeByID || this.getNodesByID();
    let target = nodeByID[edge.target];
    do {  // if target is an implicit node, only delete one edge, to avoid deleting later implicit nodes that get auto-renamed to the same thing
      let foundEdge = this.edges.find ((e) => ((!edge.source || e.source === edge.source)
                                               && (!edge.target || e.target === edge.target)));
      if (!foundEdge)
        break;
      this.replaceIncludeEdgeText (foundEdge, '');
    } while (target.nodeType !== this.implicitNodeType);
    this.removeDetached (nodeByID);
  }
  
  // Replace an include edge, or the entirety of a link edge
  replaceIncludeEdgeText (edge, newText) {
    let nodeByID = this.getNodesByID();
    let source = nodeByID[edge.source];
    this.replaceDefTextSubstr ({ edge,
                                 node: source,
                                 pos: edge.pos,
                                 nodeByID,
                                 newSubstr: newText,
                                 rebuild: true });
  }

  // Edit an edge. Delegate depending on whether it's a link or include edge
  // If it was an include edge, return true so that consumer can select the source.
  replaceEdgeText (edge, newText) {
    const isInclude = edge.edgeType === this.includeEdgeType;
    if (isInclude)
      this.replaceEdgeSourceText (edge, newText);
    else
      this.replaceLinkEdgeText (edge, newText);
    return isInclude;
  }

  // Edit include edge (replace parent node definition, i.e. local text in ancestral node; rebuild ancestor's subgraph)
  replaceEdgeSourceText (edge, newText) {
    let nodeByID = this.getNodesByID();
    let source = nodeByID[edge.source];
    this.replaceDefTextSubstr ({ edge,
                                 node: source,
                                 pos: source.linkTargetPos,
                                 nodeByID,
                                 newSubstr: newText,
                                 rebuild: true });
    this.selected = { node: edge.source };
  }

  // Edit link edge (replace local text in ancestral node, replace edge; no rebuild needed)
  replaceLinkEdgeText (edge, newText) {
    this.replaceLinkEdge (edge, newText, null);
  }

  replaceLinkEdgeTarget (edge, newTarget) {
    this.replaceLinkEdge (edge, null, newTarget);
  }

  updateNodeCoord (node) {
    this.updateNode (node);
    if (node.nodeType === this.implicitNodeType)
      this.replaceIncomingEdgeText (node);
  }

  replaceIncomingEdgeText (node, newText) {
    this.replaceLinkEdge (this.getUniqueIncomingEdge(node), newText);
  }

  getUniqueIncomingEdge (node, incoming) {
    incoming = incoming || this.getEdgesByNode().incoming;
    const nodeEntry = incoming[node.id] || [];
    if (nodeEntry.length !== 1)
      throw new Error ('node lacks unique incoming transition');
    return nodeEntry[0];
  }
  
  // Edit node (replace local text in ancestral node, or global if ancestor=self; rebuild ancestor's subgraph)
  replaceNodeText (node, newText) {
    if (node.nodeType === this.placeholderNodeType)
      node.nodeType = this.definedNodeType;
    this.replaceDefTextSubstr (extend ({ node,
                                         newSubstr: newText,
                                         rebuild: true },
                                       (node.nodeType === this.implicitNodeType
                                        ? { pos: node.linkTargetPos }
                                        : {})));
  }
  
  // getEditorState
  getEditorState() {
    const selected = this.selected;
    let editorContent = '', editorSelection = null;
    const nodeByID = this.getNodesByID();
    if (selected.edge) {
      const selectedEdge = this.selectedEdge (selected);
      const selectedSource = this.selectedEdgeSourceNode (selected);
      editorContent = (selectedEdge.edgeType === this.linkEdgeType
                       ? this.edgeText (selectedEdge, nodeByID)
                       : this.selectedNodeText (selected, selectedSource));
      if (selectedEdge.edgeType === this.includeEdgeType)
        editorSelection = this.calculateSelectionRange (selectedEdge.pos);
    } else if (selected.node)
      editorContent = this.selectedNodeText (selected);
    editorSelection = editorSelection || { startOffset: editorContent.length,
                                           endOffset: editorContent.length };
    const editorDisabled = !(selected.node || selected.edge)
          || (selected.node && this.selectedNode(selected).nodeType === this.externalNodeType);
    return { editorContent,
             editorSelection,
             editorDisabled,
             editorFocus: ((selected.node || selected.edge) && !editorDisabled) };
  }

  // Methods for modifying the text labels of the graph, maintaining consistency
  // Replace a substring of a graph entity's definition
  replaceDefTextSubstr (config) {
//    console.warn('replaceDefTextSubstr', config);
    let { newSubstr,  // required
          node, edge,      // specify either node or edge, but not both
          pos,  // if omitted, will use node pos
          newLinkTextPos, rebuild, nodeByID,  // optional
        } = config;
    const updateEntity = edge || node;
    nodeByID = nodeByID || this.getNodesByID();
    node = node || nodeByID[edge.source];  // if node wasn't specified, point it at edge's source: that's what we'll rewrite
    pos = pos || node.pos || [0, node.defText ? node.defText.length : 0];  // if no pos specified, default to rewriting the whole node
    const oldEndOffset = pos[0] + pos[1];
    const ancNode = this.getAncestor (node, nodeByID);
    const newRhs = ParseTree.parseRhs (newSubstr);
    const oldAncDefText = ancNode.defText || '';
    const replacingEntireAncDefText = (pos[0] === 0 && pos[1] === oldAncDefText.length);
    const escaped = this.escapeTopLevelBraces (newSubstr, { rhs: newRhs }),
          newText = escaped.text,
          isAlternation = escaped.isAlternation;
    const delta = newText.length - pos[1];
    ancNode.defText = oldAncDefText.slice(0,pos[0]) + newText + oldAncDefText.slice(oldEndOffset);
    if (replacingEntireAncDefText && isAlternation)
      ancNode.isAlternation = true;
    else
      delete ancNode.isAlternation;
    const newAncRhs = ParseTree.parseRhs (ancNode.defText);
    let updateSubgraph = null, getUpdateSubgraph = () => { updateSubgraph = this.getImplicitSubgraph (ancNode); };
    if (rebuild) {
      const deletedNodes = this.deleteSubgraph (ancNode, nodeByID);
      getUpdateSubgraph();
      this.rebuildSubgraph (ancNode, newAncRhs, deletedNodes);
    } else
      getUpdateSubgraph();
    const oldLinkTextPos = newLinkTextPos && updateEntity.linkTextPos.slice(0);
    const posEqual = (p, q) => { return p[0] === q[0] && p[1] === q[1]; };
    const updatePos = (p) => {
      if (p) {
        if (p[0] <= pos[0] && p[0] + p[1] >= oldEndOffset)
          p[1] += delta;
        else if (p[0] >= oldEndOffset)
          p[0] += delta;
        else if (posEqual (p, pos))
          p[1] = newText.length;
        else if (newLinkTextPos && posEqual (p, oldLinkTextPos)) {
          p[0] = newLinkTextPos[0];
          p[1] = newLinkTextPos[1];
        }
      }
    };
    // update pos[] arrays in subgraph
    updateSubgraph.nodes
      .concat (updateSubgraph.edges)
      .filter ((entity) => entity !== node && entity !== edge)
      .concat ([node])
      .concat (edge ? [edge] : [])
      .forEach ((entity) => {
        updatePos (entity.pos);
        updatePos (entity.linkTextPos);
      });
  }

  // Delete a node's implicit subgraph. Returns the list of deleted nodes, whose (x,y) coords will be needed by the rebuild
  deleteSubgraph (root, nodeByID) {
    const descendants = this.getImplicitDescendants (root);
    const isDescendant = this.makeNodePredicateObject (descendants);
    this.nodes = this.nodes.filter ((node) => !isDescendant[node.id]);
    this.edges = this.edges.filter ((edge) => !isDescendant[edge.source] && edge.source !== root.id);
    descendants.forEach ((desc) => { delete nodeByID[desc.id]; });
    return descendants;
  }

  // Rebuild a node's implicit subgraph
  rebuildSubgraph (node, rhs, deletedNodes) {
    const text = node.defText;
    const newSubgraph = this.buildGraphFromParseTree ({ rhs,
                                                        text,
                                                        name: this.symName,
                                                        selected: this.selected,
                                                        root: node,
                                                        existingNodes: this.nodes,
                                                        deletedNodes: deletedNodes
                                                      });
    this.nodes = this.nodes.concat (newSubgraph.nodes.slice(1));  // newSubgraph.nodes[0] === node, don't count it twice
    this.edges = this.edges.concat (newSubgraph.edges);
  }

  // Rebuild a link to an implicit node
  replaceLinkEdge (edge, newText, newTarget) {
    const nodeByID = this.getNodesByID();
    const source = nodeByID[edge.source], oldTarget = nodeByID[edge.target];
    const isImplicit = oldTarget.nodeType === this.implicitNodeType;
    newTarget = (!isImplicit && newTarget) || oldTarget;
    const newLinkText = this.makeMarkdownStyleLink (isImplicit ? newTarget : null,
                                                    newText || this.edgeText (edge, nodeByID),
                                                    (isImplicit
                                                     ? newTarget.defText
                                                     : this.makeLinkTargetBracery (newTarget)));

    this.replaceDefTextSubstr ({ node: source,
                                 pos: edge.pos,
                                 newSubstr: newLinkText,
                                 rebuild: true });
  }

  // Replace a node in the node list
  updateNode (node) {
    this.nodes = this.nodes.map ((n) => (n.id === node.id ? node : n));
  }

  // General Bracery text analysis & manipulation methods
  // makeNodeBracery - regenerate the Bracery for a graph node,
  // overriding the (X,Y) coordinates with whatever is in the graph,
  // and using syntactic sugar for the &layout, &link, and &placeholder functions,
  // i.e. [name@X,Y=>definition...] and so on.
  makeNodeBracery (node) {
    const xy = this.makeCoord(node);
    switch (node.nodeType) {
    case this.externalNodeType:
      return xy && (xy + ParseTree.symChar + this.nodeIdToSymbol (node.id) + '\n');
    case this.placeholderNodeType:
      return xy && (xy + ParseTree.varChar + node.id + '\n');
    case this.startNodeType:
      return (xy ? (xy + ':START\n') : '') + node.defText;
    case this.definedNodeType:
      return '[' + node.id + xy + '=>' + (node.isAlternation ? node.defText.substr(1,node.defText.length-2) : node.defText) + ']\n';
    case this.implicitNodeType:
    default:
      return '';
    }
  }
  
  // makeMarkdownStyleLink - regenerate a link of the form [text]{target}
  makeMarkdownStyleLink (node, newLinkText, newLinkTarget) {
    const xy = this.makeCoord(node);
    return '['
      + this.escapeTopLevelBraces(newLinkText).text
      + ']' + xy + '{'
      + this.escapeTopLevelBraces(newLinkTarget).text
      + '}';
  }

  // makeTwineStyleLink - generate a link of the form [[text]]
  makeTwineStyleLink (target) {
    return '[[' + target + ']]';
  }

  // makeLinkTargetBracery - for a node, generate the Bracery that should appear in the target field of a link, to link to it.
  makeLinkTargetBracery (node) {
    switch (node.nodeType) {
    case this.externalNodeType:
    case this.startNodeType:
      return ParseTree.symChar + this.nodeIdToSymbol (node.id);
    case this.definedNodeType:
    case this.placeholderNodeType:
      return ParseTree.traceryChar + node.id + ParseTree.traceryChar;
    case this.implicitNodeType:
    default:
      return '';
    }
  }

  // Convert a node ID to/from displayable form
  nodeIdToSymbol (id) {
    return id.replace (this.SYM_PREFIX, '').replace (this.SLASH_MARKER, '/');
  }

  symbolToNodeId (symName) {
    return this.SYM_PREFIX + symName.replace ('/', this.SLASH_MARKER);
  }

  makeUserSymbol (user, name) {
    return (user ? (user + '/') : '') + name;
  }

  removeUserPrefix (symbol) {
    return symbol.replace (/^.*\//, '');
  }
  
  titleForID (id, defaultTitle) {
    return (id.indexOf (this.LINK_SUFFIX) >= 0
            ? (defaultTitle || this.implicitNodeTitle)
            : (id.replace (this.SYM_PREFIX, ParseTree.symChar)
	       .replace (this.SLASH_MARKER, '/')));
  }

  titleForNode (node) {
    return this.titleForID (node.id);
  }

  // Truncate a string
  truncate (text, len) {
    return (text.length <= len
            ? text
            : (text.substr(0,len) + '...'))
  }

  // bracery - regenerate entire Bracery string.
  bracery() {
    return this.nodes.slice(1).concat(this.nodes[0]).reduce ((s, node) => s + this.makeNodeBracery(node),'');
  }
  
  // escapeTopLevelRegex
  // Parse an expression as Bracery, prefix top-level danger chars with backslashes, then regenerate it as Bracery
  escapeTopLevelRegex (text, regex, config) {
    config = config || {};
    const rhs = config.rhs || ParseTree.parseRhs(text);
    let result = { text: rhs
	           .map ((node) => (typeof(node) === 'string'
			            ? (config.noEscape
			               ? node
			               : node.replace (regex, (m) => '\\'+m))
			            : this.parseTreeNodeText(node,text)))
	           .join('') };
    if (this.parseTreeRhsIsAlternation (rhs))
      result.isAlternation = true;
    return result;
  }

  escapeTopLevelBraces (text, config) {
    return this.escapeTopLevelRegex (text, new RegExp ('[@{}[\\]|\\\\]', 'g'), config);
  }
  
  // getLinkTextPos - get the co-ordinates ('pos') for the text portion of a link,
  // given the Bracery parse tree node.
  // It is a bit awkward getting the text for a link,
  // due to all the different syntactical forms we have for links:
  //  [[Twine style]]
  //  [Markdown]{style}
  //  &link{Bracery function}{style}
  // The parser currently handles each one of these differently (and inconsistently),
  // in terms of returning the co-ordinates of the substring corresponding to
  // the Bracery source code of the the text hint that is displayed to the player.
  // This is something we should probably try to fix.
  getLinkTextPos (linkNode, text, topOffset) {
    topOffset = topOffset || 0;
    const linkTextNode = ParseTree.getLinkText (linkNode);
    const linkBracery = this.parseTreeNodeText (linkNode, text);
    // First, get the coordinates the parser reports for the text node.
    let pos = [linkTextNode.pos[0] - topOffset,
               linkTextNode.pos[1]];
    if (linkNode.isShortcut) {
      // [[Twine style]]
      // The parser-reported text node includes the double square braces [[...]], which need to be removed
      pos = this.twineStyleLinkInteriorPos (pos);
    } else if (this.isBraceryStyleLink (linkBracery)) {
      //  &link{Bracery function}{style}
      //  &link@123,-456{Positioned Bracery function}{style}
      // The parser-reported text node includes the curly braces {...}, which need to be removed
      pos = this.braceryFunctionArgInteriorPos (pos);
    } else if (this.isMarkdownStyleLink (linkBracery)) {
      // [Markdown]{style}
      // Parser gets co-ordinates right for this one, so do nothing
    }
    return pos;
  }
  
  // [[Twine style]]
  isTwineStyleLink (linkBracery) {
    return linkBracery.match(/^\[\[.*\]\]$/);
  }

  // &link{Bracery function}{style}
  isBraceryStyleLink (linkBracery) {
    return linkBracery.match(/^&link(@[-0-9]+,[-0-9]+|){/);
  }

  // [Markdown]{style}
  isMarkdownStyleLink (linkBracery) {
    return linkBracery.match(/^\[/);
  }

  // Interior of a [[Twine style link]]
  // Bracery 'pos' format is [start,length]
  twineStyleLinkInteriorPos (linkBraceryPos) {
    return [linkBraceryPos[0] + 2,
	    linkBraceryPos[1] - 4];
  }

  // Interior of a {Bracery expression}
  // Bracery 'pos' format is [start,length]
  braceryFunctionArgInteriorPos (functionArgBraceryPos) {
    return [functionArgBraceryPos[0] + 1,
	    functionArgBraceryPos[1] - 2];
  }

  // getLinkTargetPosForBracery - get the target text for a link
  // This is a little easier than getLinkTextPos, as we can ignore Twine-style links
  // (where the link target is synthesized from the link text, and not actually present in the parsed text)
  getLinkTargetPosForBracery (linkBracery, linkTargetNode, topOffset) {
    let pos = [linkTargetNode.pos[0] - topOffset,
               linkTargetNode.pos[1]];
    if (this.isBraceryStyleLink (linkBracery))
      pos = this.braceryFunctionArgInteriorPos (pos);
    return pos;
  }

  // parseCoord - parses an X,Y coordinate
  parseCoord (coord) {
    const xy = coord.split(',');
    return { x: parseFloat (xy[0]),
	     y: parseFloat (xy[1]) };
  }

  // Bracery parse tree analysis
  // Specialized version of ParseTree.findNodes for checking if a tree contains no variable lookups, symbols, or links
  isStaticExpr (rhs) {
    return ParseTree.findNodes (rhs, {
      nodePredicate: (nodeConfig, node) => {
        return (typeof(node) === 'object'
                && (node.type === 'sym'
                    || node.type === 'lookup'
                    || (node.type === 'func'
                        && node.funcname === 'link')))
      }
    }).length === 0
  }

  // Specialized version of ParseTree.findNodes that returns names of variables (assignments and lookups) and symbols
  symAndVarNames (rhs) {
    return Object.keys (fromEntries (ParseTree.findNodes (rhs, {
      nodePredicate: (nodeConfig, node) => {
        if (typeof(node) === 'object') {
          if (node.type === 'sym')
            return node.name;
          if (node.type === 'lookup' || node.type === 'assign')
            return node.varname;
        }
        return false;
      }
    }).map ((name) => [name, true]))).sort();
  }

  // Specialized version of ParseTree.findNodes that searches the parse tree for $id (assignments and lookups) or #id#
  getVarNodes (rhs, id) {
    return ParseTree.findNodes (rhs, {
      nodePredicate: (nodeConfig, node) => {
	return (node
		&& typeof(node) === 'object'
		&& (((node.type === 'lookup' || node.type === 'assign')
		     && node.varname === id)
		    || (node.isShortcut
			&& ParseTree.traceryVarName (ParseTree.getLinkTargetRhs (node)[0]) === id)
		    || (ParseTree.isTraceryExpr (node)
			&& ParseTree.traceryVarName (node) === id))
		&& node);  // must return node
      },
      makeChildConfig: (nodeConfig, node, nChild) => {
	const result = ((node.isShortcut || ParseTree.isTraceryExpr (node))
			? { excludeSubtree: true }
			: nodeConfig);
	return result;
      }
    });
  }

  // Wrappers for ParseTree.getSymbolNodes that find various types of nodes
  getTargetNodes (rhs, config, namer) {
    return ParseTree.getSymbolNodes (rhs, config)
      .map ((target) => extend (target, { graphNodeId: namer(target) }))
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
                                (n) => this.symbolToNodeId (this.makeUserSymbol (n.user, n.name)));
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
  parseTreeRhsTextOffset (rhs, rhsParentNode, origText, config) {
    config = config || {};
    const text = this.parseTreeNodesText (rhs, origText);
    const offset = (rhsParentNode && rhsParentNode.pos) ? rhsParentNode.pos[0] : 0;
    return (config.addBracketsToAlt && this.parseTreeRhsIsAlternation(rhs)  // x|y|z
            ? { text: (ParseTree.leftSquareBraceChar + text + ParseTree.rightSquareBraceChar),  // [x|y|z]
                offset: offset - 1,
                isAlternation: true }
            : { text: text,
                offset: offset + (origText.charAt(offset) === ParseTree.leftBraceChar  // remove enclosing braces
                                  && origText.charAt(offset) !== text.charAt(0)
                                  ? 1
                                  : 0) });
  }

  parseTreeRhsIsAlternation (rhs) {
    return rhs.length === 1 && typeof(rhs[0]) === 'object' && rhs[0].type === 'alt';
  }

  // Helper pseudo-class for parse tree analysis
  newParseTreeAnalyzer (rhs, text, symName, existingNodes) {
    let nodeByID = this.getNodesByID (existingNodes || []);
    let braceryNodeRhsByID = {};
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

  // Graph analysis
  // Get a node's implicit subgraph
  getImplicitSubgraph (node) {
    const descendants = this.getImplicitDescendants (node);
    const isDescendant = this.makeNodePredicateObject (descendants);
    return { nodes: descendants,
             edges: this.edges.filter ((edge) => isDescendant[edge.source] || edge.source === node.id) };
  }

  // Get all nodes whose top-level ancestor "owner" is a given node
  getImplicitDescendants (node) {
    return this.nodes.filter ((n) => n.topLevelAncestorID === node.id);
  }
  
  // Make an object mapping node IDs to true
  makeNodePredicateObject (nodeList) {
    return fromEntries (nodeList.map ((node) => [node.id, true]));
  }

  // Make an object mapping names in the namespace to true
  isVarName() {
    return fromEntries (
      this.nodes
        .filter ((node) => node.nodeType !== this.implicitNodeType)
        .reduce ((names, node) => names
                 .concat (this.nodeIdToSymbol(node.id).split('/'))
                 .concat (node.symAndVarNames || []),
                 [])
        .map ((name) => [name, true]));
  }

  // Find the max suffix of any autogenerated variable names
  maxVarSuffix (prefix) {
    prefix = prefix || this.newVarPrefix;
    const isVarName = this.isVarName();
    const prefixRegex = new RegExp ('^' + prefix + '([0-9]+)$');
    return Object.keys (isVarName)
      .map ((name) => prefixRegex.exec (name))
      .filter ((match) => match)
      .map ((match) => parseInt(match[1]))
      .reduce ((max, n) => Math.max (max, n), 0);
  }

  // Autogenerate a variable name
  newVar (prefix) {
    prefix = prefix || this.newVarPrefix;
    return prefix + (this.maxVarSuffix (prefix) + 1);
  }

  // Text for a substring
  // Bracery 'pos' format for substrings is [start,length]
  getPosSubstr (text, pos) {
    return (text && pos
            ? text.substr (pos[0], pos[1])
            : '');
  }

  // Text for a graph node, or substring associated with a node (pos is optional, defaults to node pos)
  nodeText (node, pos, nodeByID) {
    if (node.defText && !pos)
      return node.defText;
    let ancestor = this.getAncestor (node, nodeByID);
    if (!ancestor)
      console.error ("can't find ancestor", node, nodeByID);
    return this.getPosSubstr (ancestor.defText, pos || node.pos);
  }

  // Get a node's top-level ancestor (which "owns" its text definition)
  getAncestor (node, nodeByID) {
    return (node.topLevelAncestorID
            ? (nodeByID
               ? nodeByID[node.topLevelAncestorID]
               : this.findNodeByID (node.topLevelAncestorID))
            : node);
  }
  
  // Text for a graph edge
  // For link edges, this defaults to just the link text, unless config.useFullEdge is truthy.
  edgeText (edge, nodeByID, config) {
    nodeByID = nodeByID || this.getNodesByID();
    const useFullEdge = config && config.useFullEdge;
    let source = nodeByID[edge.source];
    let ancestor = this.getAncestor (source, nodeByID);
    const pos = (!useFullEdge && edge.linkTextPos) || edge.pos;
    return this.getPosSubstr (ancestor.defText, pos);
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

  // Make an @X,Y coordinate tag for a graph node, or the empty string if node isn't defined or positioned
  makeCoord (node) {
    if (node && typeof(node.x) !== 'undefined') {
      const x = Math.round(node.x), y = Math.round(node.y);
      return '@' + x + ',' + y;
    }
    return '';
  }

  // Build incoming & outgoing lookups
  getEdgesByNode (edges) {
    let incoming = {}, outgoing = {};
    (edges || this.edges).forEach ((edge) => {
      const pushEdge = (obj, prop) => {
        obj[prop] = (obj[prop] || []).concat ([edge]);
      };
      pushEdge (incoming, edge.target);
      pushEdge (outgoing, edge.source);
    });
    return { incoming, outgoing };
  }

  incomingEdges (id) {
    let { incoming } = this.getEdgesByNode();
    return incoming[id] || [];
  }

  outgoingEdges (id) {
    let { outgoing } = this.getEdgesByNode();
    return outgoing[id] || [];
  }

  // Index nodes by ID
  getNodesByID (nodes) {
    return fromEntries ((nodes || this.nodes).map ((node) => [node.id, node]));
  }

  // Find node by ID
  findNodeByID (id, nodeByID) {
    return (nodeByID
            ? nodeByID[id]
            : this.nodes.find ((node) => node.id === id));
  }

  // Various methods for working with the representation of the current selection (node or edge)
  selectedNode (selected, nodeByID) {
    selected = selected || this.state.selected;
    return (selected.node
            ? this.findNodeByID (selected.node, nodeByID)
            : null);
  }

  selectedNodeText (selected, node, nodeByID) {
    node = node || this.selectedNode (selected, nodeByID);
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

  selectedEdgeSourceNode (selected, nodeByID) {
    selected = selected || this.state.selected;
    return (selected.edge
            ? this.findNodeByID (selected.edge.source, nodeByID)
            : null);
  }

  selectedEdgeTargetNode (selected, nodeByID) {
    selected = selected || this.state.selected;
    return (selected.edge
            ? this.findNodeByID (selected.edge.target, nodeByID)
            : null);
  }

  // calculateSelectionRange converts a ParseGraph-style pos=[start,len] tuple to an HTML-style {startOffset,endOffset}
  calculateSelectionRange (pos) {
    return { startOffset: pos[0],
	     endOffset: pos[0] + pos[1] };
  }

  // Graph-building helpers
  // Add an edge and note its child rank
  addEdge (edges, edge, childRank) {
    if (edge.source === edge.target)  // No self-looping edges allowed. react-digraph won't display them anyway
      return null;
    edge.edgeType = edge.type;  // preserve type against later modification of selected edge type
    edges.push (edge);
    if (childRank) {
      let { outgoing } = this.getEdgesByNode (edges);
      let srcChildRank = childRank[edge.source];
      if (!srcChildRank[edge.target])
	srcChildRank[edge.target] = outgoing[edge.source].length + 1;
    }
    return edge;
  }

  // Main build methods
  // Get subgraph corresponding to a Bracery expression
  makeImplicitNodesAndEdges (rootNode, topLevelNode, rhs, pta) {
    let { text, nodeByID, layoutParent, braceryNodeOffset, pushNode, braceryNodeRhsByID } = pta;
    let implicitNodes = [], edges = [];
    braceryNodeRhsByID[rootNode.id] = rhs;
    this.getLinkedNodes (rootNode.id, rhs)
      .forEach ((linkNode) => {
        const isLink = ParseTree.isLinkExpr(linkNode);
        const isLayoutLink = ParseTree.isLayoutLinkExpr(linkNode);
        const parent = (linkNode.inLink && linkNode.link
                        ? nodeByID[linkNode.link.graphNodeId]
                        : rootNode);
        const actualLinkNode = (isLink
                                ? linkNode
                                : (isLayoutLink
                                   ? ParseTree.getLayoutLink(linkNode)
                                   : null));
        const linkBracery = this.parseTreeNodeText (actualLinkNode, text);
        const linkTargetRhs = ParseTree.getLinkTargetRhs (actualLinkNode);
        const linkTargetRhsNode = ParseTree.getLinkTargetRhsNode (actualLinkNode);
        const linkTargetTextOffset = this.parseTreeRhsTextOffset (linkTargetRhs, linkTargetRhsNode, text);
        let uniqueTarget = null;
        let escaped = this.escapeTopLevelBraces(linkTargetTextOffset.text),
            defText = escaped.text,
            isAlternation = escaped.isAlternation;
        if (linkTargetRhs.length === 1) {
          const linkTargetNode = linkTargetRhs[0];
          if (ParseTree.isEvalVar(linkTargetNode)) {
            uniqueTarget = ParseTree.getEvalVar(linkTargetNode);
          } else if (linkTargetNode.type === 'sym') {
            uniqueTarget = this.symbolToNodeId (this.makeUserSymbol (linkTargetNode.user, linkTargetNode.name));
          } else if (ParseTree.isTraceryExpr(linkTargetNode)) {
            uniqueTarget = ParseTree.traceryVarName (linkTargetNode);
            if (this.isTwineStyleLink (linkBracery))
              defText = this.makeTraceryText (linkTargetRhs);
          }
        }
        const topOffset = braceryNodeOffset[rootNode.id] || 0;
        const linkTextPos = this.getLinkTextPos (actualLinkNode, text, topOffset);
        const linkTargetPos = this.getLinkTargetPosForBracery (linkBracery, linkTargetRhsNode, topOffset);
        const implicitNodeID = linkNode.graphNodeId;
        braceryNodeOffset[implicitNodeID] = linkTargetTextOffset.offset;
        layoutParent[implicitNodeID] = parent;
        const implicitNode = extend (
          {
            id: implicitNodeID,
            pos: [linkNode.pos[0] - topOffset,
                  linkNode.pos[1]],
            nodeType: this.implicitNodeType,
            topLevelAncestorID: topLevelNode.id,
            linkTextPos,
            linkTargetPos,
            defText,
          },
          isAlternation ? {isAlternation} : {},
          uniqueTarget ? {uniqueTarget} : {},
          (isLayoutLink
           ? this.parseCoord (ParseTree.getLayoutCoord (linkNode))
           : {}));
        pushNode (implicitNodes, implicitNode, linkNode, linkTargetRhs);
      });
    
    // Create include & link edges
    const realNodes = [rootNode].concat (implicitNodes);
    let childRank = fromEntries (realNodes.map ((node) => [node.id, {}]));
    const addEdge = (edge) => { this.addEdge (edges, edge, childRank); };
    realNodes.forEach ((node) => {
      // Create outgoing include edges from every node
      if (!node.uniqueTarget) {
        const srcOffset = braceryNodeOffset[node.id] || 0;
        const nodeRhs = braceryNodeRhsByID[node.id];
        this.getIncludedNodes (nodeRhs)
          .concat (this.getExternalNodes (nodeRhs))
          .map ((target) => addEdge ({ source: node.id,
                                       target: target.graphNodeId,
                                       type: this.includeEdgeType,
                                       pos: [target.pos[0] - srcOffset,
                                             target.pos[1]] }))
      }
    });

    // Create link edges for every implicit node
    implicitNodes.forEach ((node) => addEdge (extend ({ source: layoutParent[node.id].id,
                                                        target: node.uniqueTarget || node.id,
                                                        type: this.linkEdgeType,
                                                        pos: node.pos.slice(0),
							linkTextPos: node.linkTextPos.slice(0) })));

    // Return
    return { implicitNodes, edges, braceryNodeOffset, braceryNodeRhsByID, layoutParent, childRank, nodeByID };
  }

  // Create placeholders for unknown & external nodes
  makePlaceholders (node, rhs, pta) {
    let { nodeByID, layoutParent, pushNode } = pta;
    let placeholderNodes = [];
    const createPlaceholders = (nodes, attrs) => {
      nodes.forEach ((target) => {
	const targetNode = nodeByID[target.graphNodeId];
        if (targetNode) {
	  if (!layoutParent[targetNode.id]
              && targetNode.nodeType !== this.startNodeType
              && !this.nodeInSubtree (node, targetNode, layoutParent))
	    layoutParent[targetNode.id] = node;
	} else {
	  const newNode = extend ({ id: target.graphNodeId },
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

  filterOutDetachedNodes (nodes, edges, pta) {
    // Remove any placeholders, implicit, or external nodes that don't have incoming or outgoing edges
    const { nodeByID } = pta;
    const { incoming, outgoing } = this.getEdgesByNode (edges);
    const nodeDetached = (node) => ((node.nodeType === this.placeholderNodeType
                                     || node.nodeType === this.externalNodeType
                                     || node.nodeType === this.implicitNodeType)
                                    && !(incoming[node.id] && incoming[node.id].length)
                                    && !(outgoing[node.id] && outgoing[node.id].length));
    const detachedNodes = nodes.filter ((node) => nodeDetached(node));
    const isDetached = this.makeNodePredicateObject (detachedNodes);
    const attachedNodes = nodes
          .filter ((node) => !isDetached[node.id]);
    detachedNodes.forEach ((node) => { delete nodeByID[node]; });
    return attachedNodes;
  }

  // Create layout tree structure
  doTreeLayout (nodes, edges, pta, deletedNodes) {
    // - Ensure every node (except start) has a parent.
    // - If a node's parent is a skipped implicit node (i.e. an implicit node with a unique target),
    //   then set the node's parent to its grandparent; repeat until the parent is not a skipped implicit node.
    // - Sort children by the order that the parent->child edges appear.
    //   This keeps the automatic hierarchical layout stable when we add placeholders, etc.
    let { layoutParent, childRank, nodeByID } = pta;
    const { outgoing } = this.getEdgesByNode (edges);
    const startNode = nodes[0];
    const deletedNodeByID = deletedNodes && this.getNodesByID(deletedNodes);
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
        const deletedNode = deletedNodes && deletedNodeByID[node.id];
        const parent = layoutParent[node.id];
        if (deletedNode)
          extend (node, { x: deletedNode.x,
                          y: deletedNode.y });
        else if (parent) {
	  layoutNode (parent);
	  const angleRange = Math.PI, angleOffset = -angleRange/2;
	  const angle = angleOffset + angleRange * relativeChildRank[node.id];
	  const radius = this.layoutRadius;
	  node.x = parent.x + Math.cos(angle) * radius;
	  node.y = parent.y + Math.sin(angle) * radius;
        } else
          node.x = node.y = 0;
      }
    };
    nodes.forEach (layoutNode);
  }

  // react-digraph has an awkward enforced separation between nodes and styling information,
  // that we have to bridge.
  // The 'typeText' and 'title' fields correspond to what would more commonly be called 'title' & 'subtitle'.
  // However, while a 'title' (i.e. subtitle) can be specified at the node level,
  // the 'typeText' (i.e. title) must be specified in the styling information.
  bridgeNodesToStyles (nodes, pta) {
    nodes = nodes || this.nodes;
    const nodeByID = pta ? pta.nodeByID : this.getNodesByID();
    const symName = pta ? pta.symName : this.symName;
    nodes.forEach ((node) => {
      let typeText = null, title = null;
      switch (node.nodeType) {
      case this.externalNodeType:
        typeText = this.titleForNode (node) + ' ';
        title = '';
        break;
      case this.placeholderNodeType:
        typeText = node.id;
        title = this.placeholderNodeText;
        break;
      case this.implicitNodeType:
        typeText = '';
        title = this.nodeText (node, node.linkTargetPos, nodeByID);
        break;
      case this.startNodeType:
        typeText = ParseTree.symChar + this.removeUserPrefix(symName)+ ' ';
        title = node.defText;
        break;
      default:
        typeText = node.id;
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
    const startNodeID = this.symbolToNodeId (this.removeUserPrefix (symName));
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
	    node.id = this.symbolToNodeId (this.makeUserSymbol (heldNode.user, heldNode.name));
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
        topLevelNodes = topLevelNodes.filter ((n) => {
          if (n.id === node.id) {
            extend (node, { x: n.x,
                            y: n.y });
            return false;
          }
          return true;
        });
        const parsed = this.parseTreeRhsTextOffset (braceryNodeRhs,
                                                    braceryDefNode,
                                                    text,
                                                    { addBracketsToAlt: true });
        extend (node,
                { defText: parsed.text },
                parsed.isAlternation ? { isAlternation: true } : {},
               );
        braceryNodeOffset[node.id] = parsed.offset;
	pushNode (topLevelNodes,
		  node,
		  braceryNode,
		  braceryNodeRhs,
		  { insertAtStart: node.nodeType === this.startNodeType });
	startOffset = braceryNode.pos[0] + braceryNode.pos[1];
      } else if (this.isStaticExpr ([braceryNode])) {
	braceryStartNodeRhs.push (braceryNode);
	if (typeof(braceryNode) === 'string') {
          startDefText += braceryNode;
	  startOffset += braceryNode.length;
	} else {
	  startDefText += text.substr (braceryNode.pos[0], braceryNode.pos[1]);
	  startOffset = braceryNode.pos[0] + braceryNode.pos[1];
	}
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

  // Clear highlights
  clearHighlighted() {
    this.nodes.forEach ((node) => { delete node.highlighted; });
    ((config) => {
      this.edges.forEach ((edge) => { delete edge.highlighted; edge.type = edge.type.replace (config.regex, config.replace); });
    }) ({
      regex: new RegExp ('^(.*)' + this.highlightedEdgeTypeSuffix + '(' + this.selectedEdgeTypeSuffix + '|)$'),
      replace: (_match, prefix, suffix) => prefix + suffix,
    });
  }

  // Mark highlighted nodes & edges
  markHighlighted (nodePredicate, edgePredicate, nodeByID) {
    nodeByID = nodeByID || this.getNodesByID();
    this.clearHighlighted();
    const highlightedNodes = this.nodes.filter ((n) => nodePredicate (n,
								      this.nodeText (n, n.linkTargetPos, nodeByID),
								      nodeByID)),
	  highlightedEdges = this.edges.filter ((e) => edgePredicate (e,
								      (e.edgeType === this.linkEdgeType
								       ? this.edgeText (e, nodeByID)
								       : this.getPosSubstr (this.nodeText (nodeByID[e.source],
													   null,
													   nodeByID),
											    e.pos)),
								      nodeByID));

    highlightedNodes.forEach ((n) => { n.highlighted = true; });
    ((config) => {
      highlightedEdges.forEach ((edge) => { edge.highlighted = true; edge.type = edge.type.replace (config.regex, config.replace); }); }
    ) ({
      regex: new RegExp ('^(.*?)(' + this.selectedEdgeTypeSuffix + '|)$'),
      replace: (_match, prefix, suffix) => prefix + this.highlightedEdgeTypeSuffix + suffix,
    });
  }
  
  // Clear selection
  clearSelected (nodes, edges) {
    nodes = nodes || this.nodes;
    edges = edges || this.edges;
    nodes.forEach ((node) => { delete node.selectedOutgoingEdge; delete node.selectedIncomingEdge; delete node.selected; });
    ((regex) => {
      edges.forEach ((edge) => { delete edge.selected; edge.type = edge.type.replace (regex, ''); });
    }) (new RegExp (this.selectedEdgeTypeSuffix + '$', 'g'));
  }

  // Mark selected node/edge
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
        .filter ((edge) => !edge.selected)  // newly-selected edges only
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
