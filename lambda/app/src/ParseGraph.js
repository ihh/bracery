import { ParseTree } from 'bracery';
import { extend, fromEntries } from './bracery-web';

// ParseGraph
// A graph representation of a Bracery parse tree that
//  - can be passed to react-digraph
//  - knows how to consistently update itself
//  - is readily serializable (no circular references, at least in this.nodes & this.edges)

// TODO:
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
  set selected (s) { this.state.selected = s; this.unselectAll(); this.markSelected(); }
  
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
    this.unselectAll (nodes, edges);
    this.markSelected (selected, edges, pta);
    
    // We now have the graph
    return { nodes, edges, selected };
  }

  // Actions
  // Edit an edge. Delegate depending on whether it's a link or include edge
  replaceEdgeText (edge, newText) {
    if (edge.edgeType === this.linkEdgeType)
      this.replaceLinkEdgeText (edge, newText);
    else
      this.replaceIncludeEdgeText (edge, newText);
  }

  // Edit include edge (replace parent node definition, i.e. local text in ancestral node; rebuild ancestor's subgraph)
  replaceIncludeEdgeText (edge, newText) {
    let nodeByID = this.getNodesByID();
    let source = nodeByID[edge.source];
    this.replaceDefTextSubstr ({ edge,
                                 node: source,
                                 pos: source.linkTargetPos,
                                 nodeByID,
                                 newSubstr: newText,
                                 escape: true,
                                 rebuild: true });
    this.selected = { node: edge.source };
  }

  // Edit link edge (replace local text in ancestral node, replace edge; no rebuild needed)
  replaceLinkEdgeText (edge, newText) {
    this.replaceLinkEdge (edge, newText);
  }

  replaceLinkEdge (edge, newText) {
//    console.warn('replaceLinkEdge', edge, newText);
    const nodeByID = this.getNodesByID();
    const source = nodeByID[edge.source], target = nodeByID[edge.target];
    const isImplicit = target.nodeType === this.implicitNodeType;
    const newLinkText = this.makeLinkBracery (isImplicit ? target : null,
                                              newText || this.edgeText (nodeByID, edge),
                                              (isImplicit
                                               ? target.defText
                                               : this.makeLinkTargetBracery (target)));

    this.replaceDefTextSubstr ({ node: source,
                                 pos: edge.pos,
                                 newSubstr: newLinkText,
                                 escape: false,
                                 rebuild: true });
  }
  
  updateNodeCoord (node) {
//    console.warn('updateNodeCoord', node);
    this.updateNode (node);
    if (node.nodeType === this.implicitNodeType)
      this.replaceIncomingEdgeText (node);
  }

  replaceIncomingEdgeText (node, newText) {
    const { incoming } = this.getEdgesByNode();
    const nodeEntry = incoming[node.id] || [];
    if (nodeEntry.length !== 1)
      throw new Error ('node lacks unique incoming transition');
    this.replaceLinkEdge (nodeEntry[0], newText);
  }

  // Edit node (replace local text in ancestral node, or global if ancestor=self; rebuild ancestor's subgraph)
  replaceNodeText (node, newText) {
    let nodeByID = this.getNodesByID();
    if (node.nodeType === this.placeholderNodeType) {
      let implicitParent = nodeByID[node.implicitParent];
      if (!implicitParent)
        console.error(node,nodeByID);
      implicitParent.implicitChildren = implicitParent.implicitChildren.filter ((c) => c !== node.id);
      delete node.implicitParent;
      node.nodeType = this.definedNodeType;
    }
    this.replaceDefTextSubstr (extend ({ node,
                                         newSubstr: newText,
                                         rebuild: true },
                                       (node.nodeType === this.implicitNodeType
                                        ? { escape: true,
                                            pos: node.linkTargetPos }
                                        : {})));
  }

  updateNode (node) {
    this.nodes = this.nodes.map ((n) => (n.id === node.id ? node : n));
  }
  
  // Methods for modifying the text labels of the graph, maintaining consistency
  // Replace a substring of a graph entity's definition
  replaceDefTextSubstr (config) {
//    console.warn('replaceDefTextSubstr', config);
    let { newSubstr,  // required
          node, edge,      // specify either node or edge, but not both
          pos,  // if omitted, will use node pos
          newLinkTextPos, escape, rebuild, nodeByID,  // optional
        } = config;
    const updateEntity = edge || node;
    nodeByID = nodeByID || this.getNodesByID();
    node = node || nodeByID[edge.source];  // if node wasn't specified, point it at edge's source: that's what we'll rewrite
    pos = pos || node.pos || [0, node.defText ? node.defText.length : 0];  // if no pos specified, default to rewriting the whole node
    const oldEndOffset = pos[0] + pos[1];
    const ancNode = this.getAncestor (node, nodeByID);
    const newRhs = ParseTree.parseRhs (newSubstr);
    const newText = (escape
                     ? this.escapeTopLevelBraces (newSubstr, { rhs: newRhs })
                     : newSubstr);
    const delta = newText.length - pos[1];
    const oldAncDefText = ancNode.defText || '';
    ancNode.defText = oldAncDefText.slice(0,pos[0]) + newText + oldAncDefText.slice(oldEndOffset);
    const newAncRhs = ParseTree.parseRhs (ancNode.defText);
    let updateSubgraph = null, getUpdateSubgraph = () => { updateSubgraph = this.getImplicitSubgraph (ancNode, nodeByID); };
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
//    console.warn('replaceDefTextSubstr exit', updateEntity, edge ? node : null, updateSubgraph, this.nodes);
  }

  // Delete a node's implicit subgraph. Returns the list of deleted nodes, whose (x,y) coords will be needed by the rebuild
  deleteSubgraph (root, nodeByID) {
    const descendants = this.getImplicitDescendants (root, nodeByID);
    const isDescendant = this.makeNodePredicateObject (descendants);
    delete root.implicitChildren;
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

  // General Bracery text analysis & manipulation methods
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
      return '[' + node.id + xy + '=>' + this.escapeTopLevelBraces (node.defText, { removeBracketsFromAlt: true }) + ']\n';
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
    let result = rhs
	  .map ((node) => (typeof(node) === 'string'
			   ? (config.noEscape
			      ? node
			      : node.replace (regex, (m) => '\\'+m))
			   : this.parseTreeNodeText(node,text)))
	  .join('');
    if (config.removeBracketsFromAlt && rhs.length === 1 && typeof(rhs[0]) === 'object' && rhs[0].type === 'alt')
      result = result.substr(1,result.length-2);
    return result;
  }

  escapeTopLevelBraces (text, config) {
    return this.escapeTopLevelRegex (text, new RegExp ('[@{}[\\]|\\\\]', 'g'), config);
  }
  
  // getLinkTextPos - get the text for a link
  getLinkTextPos (linkBracery, linkTextNode, topOffset) {
    // It is a bit ragged getting the text for a link,
    // due to all the different syntactical forms we have for links:
    //  [[Twine style]]
    //  [Markdown]{style}
    //  &link{Bracery function}{style}
    // The parser currently handles each one of these slightly differently,
    // in terms of returning the co-ordinates of the text substring,
    // which is something we should probably try to fix.
    let pos = [linkTextNode.pos[0] - topOffset,
               linkTextNode.pos[1]];
    if (this.isTwineStyleLink (linkBracery)) {
      // [[Twine style]]
      // Needs correction to remove double square braces
      pos[0] += 2;
      pos[1] -= 4;
    } else if (this.isBraceryStyleLink (linkBracery)) {
      //  &link{Bracery function}{style}
      //  &link@123,-456{Positioned Bracery function}{style}
      // Needs correction to remove curly braces
      pos[0] += 1;
      pos[1] -= 2;
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

  // getLinkTargetPos - get the target text for a link
  // This is a little easier than getLinkTextPos, as we can ignore Twine-style links
  // (where the link target is synthesized from the link text, and not actually present in the parsed text)
  getLinkTargetPos (linkBracery, linkTargetNode, topOffset) {
    let pos = [linkTargetNode.pos[0] - topOffset,
               linkTargetNode.pos[1]];
    if (this.isBraceryStyleLink (linkBracery)) {
      pos[0] += 1;
      pos[1] -= 2;
    }
    return pos;
  }

  // parseCoord - parses an X,Y coordinate
  parseCoord (coord) {
    const xy = coord.split(',');
    return { x: parseFloat (xy[0]),
	     y: parseFloat (xy[1]) };
  }

  // Bracery parse tree analysis
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
                offset: offset - 1 }
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
  getImplicitSubgraph (node, nodeByID) {
    const descendants = this.getImplicitDescendants (node, nodeByID);
    const isDescendant = this.makeNodePredicateObject (descendants);
    return { nodes: descendants,
             edges: this.edges.filter ((edge) => isDescendant[edge.source]) };
  }

  makeNodePredicateObject (nodeList) {
    return fromEntries (nodeList.map ((node) => [node.id, true]));
  }
  
  getImplicitDescendants (node, nodeByID) {
    nodeByID = nodeByID || this.getNodesByID();
    return (node.implicitChildren || [])
      .map ((id) => nodeByID[id])
      .filter ((id) => id)
      .reduce ((descendants, child) => descendants.concat ([child]).concat (this.getImplicitDescendants (child)),
               []);
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
    let ancestor = this.getAncestor (node, nodeByID);
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
  edgeText (nodeByID, edge) {
    let source = nodeByID[edge.source];
    let ancestor = this.getAncestor (source, nodeByID);
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

  // Index nodes by ID
  getNodesByID (nodes) {
    return fromEntries ((nodes || this.nodes).map ((node) => [node.id, node]));
  }

  // Find node by ID
  findNodeByID (id) {
    return this.nodes.find ((node) => node.id === id);
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

  // Graph-building helpers
  // Add an edge and note its child rank
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
                        ? nodeByID[linkNode.link.graphNodeName]
                        : rootNode);
        const actualLinkNode = (isLink
                                ? linkNode
                                : (isLayoutLink
                                   ? ParseTree.getLayoutLink(linkNode)
                                   : null));
        const linkBracery = this.parseTreeNodeText (actualLinkNode, text);
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
            uniqueTarget = ParseTree.traceryVarName (linkTargetNode);
            if (this.isTwineStyleLink (linkBracery))
              defText = this.makeTraceryText (linkTargetRhs);
          }
        }
        const topOffset = braceryNodeOffset[rootNode.id] || 0;
        const linkTextPos = this.getLinkTextPos (linkBracery, linkTextNode, topOffset);
        const linkTargetPos = this.getLinkTargetPos (linkBracery, linkTargetRhsNode, topOffset);
        const implicitNodeID = linkNode.graphNodeName;
        braceryNodeOffset[implicitNodeID] = linkTargetTextOffset.offset;
        parent.implicitChildren = (parent.implicitChildren || []).concat ([implicitNodeID]);
        layoutParent[implicitNodeID] = parent;
        const implicitNode = extend (
          {
            id: implicitNodeID,
            pos: [linkNode.pos[0] - topOffset,
                  linkNode.pos[1]],
            nodeType: this.implicitNodeType,
            implicitParent: parent.id,
            topLevelAncestorID: topLevelNode.id,
            linkTextPos,
            linkTargetPos,
            defText,
          },
          uniqueTarget ? {uniqueTarget} : {},
          (isLayoutLink
           ? this.parseCoord (ParseTree.getLayoutCoord (linkNode))
           : {}));
//        console.warn({linkTargetTextOffset,implicitNode});
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
                                       target: target.graphNodeName,
                                       type: this.includeEdgeType,
                                       pos: [target.pos[0] - srcOffset,
                                             target.pos[1]] }))
      }
    });

    // Create link edges for every implicit node
    implicitNodes.forEach ((node) => addEdge (extend ({ source: layoutParent[node.id].id,
                                                        type: this.linkEdgeType,
                                                        pos: node.pos.slice(0),
							linkTextPos: node.linkTextPos.slice(0) },
                                                      (node.uniqueTarget
                                                       ? { target: node.uniqueTarget,
                                                           link: node.id }
                                                       : { target: node.id }))));

    // Return
    return { implicitNodes, edges, braceryNodeOffset, braceryNodeRhsByID, layoutParent, childRank, nodeByID };
  }

  // Create placeholders for unknown & external nodes
  makePlaceholders (node, rhs, pta) {
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

    node.implicitChildren = (node.implicitChildren || []).concat (placeholderNodes.map ((p) => p.id));
    placeholderNodes.forEach ((p) => { p.implicitParent = node.id; });
    
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
          .filter ((node) => !isDetached[node.id])
          .map ((node) => extend (node,
                                  node.implicitChildren
                                  ? { implicitChildren: node.implicitChildren.filter ((c) => !isDetached[c]) }
                                  : {},
                                  node.implicitParent && isDetached[node.implicitParent]
                                  ? { implicitParent: nodeByID[node.implicitParent].implicitParent }
                                  : {}));
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
      node.orig = { x: node.x, y: node.y };
    };
    nodes.forEach (layoutNode);
  }

  // react-digraph has an awkward enforced separation between nodes and styling information,
  // that we have to bridge.
  // The 'typeText' and 'title' fields correspond to what would more commonly be called 'title' & 'subtitle'.
  // However, while a 'title' (i.e. subtitle) can be specified at the node level,
  // the 'typeText' (i.e. title) must be specified in the styling information.
  bridgeNodesToStyles (nodes, pta) {
    let { nodeByID } = pta;
    nodes.forEach ((node) => {
      let typeText = null, title = null;
      switch (node.nodeType) {
      case this.externalNodeType:
        typeText = node.id.replace (this.SYM_PREFIX, ParseTree.symChar) + ' ';
        title = '';
        break;
      case this.placeholderNodeType:
        typeText = node.id;
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
        const defTextOffset = this.parseTreeRhsTextOffset (braceryNodeRhs, braceryDefNode, text, { addBracketsToAlt: true });
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
