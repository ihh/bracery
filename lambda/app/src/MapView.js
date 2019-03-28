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

class MapView extends Component {
  // Constants
  get START() { return 'START'; }
  get SYM_PREFIX() { return 'SYM_'; }

  get layoutRadius() { return 300; }
  get layoutRadiusMultiplier() { return 0.8; }
  get maxNodeTitleLen() { return 24; }
  get maxEdgeHandleLen() { return 10; }

  get startNodeType() { return 'start'; }
  get definedNodeType() { return 'defined'; }
  get externalNodeType() { return 'external'; }
  get placeholderNodeType() { return 'placeholder'; }

  get placeholderNodeText() { return 'Double-click to add text'; }
  get emptyNodeText() { return '(empty)'; }

  get includeEdgeType() { return 'include'; }
  get linkEdgeType() { return 'link'; }

  // Helpers
  truncate (text, len) {
    return (text.length <= len
            ? text
            : (text.substr(0,len) + '...'))
  }
  
  nodeText (app, node, fallback) {
    return (typeof(node) === 'string'
                  ? node
                  : (node.pos
                     ? app.state.evalText.substr (node.pos[0], node.pos[1]).replace (/^{([\s\S]*)}$/, (_m,c)=>c)
                     : fallback));
  }

  nodesText (app, nodes, fallback) {
    const mv = this;
    return nodes.reduce((pre,node) => pre + mv.nodeText(app,node),'') || fallback || ''
  }

  nodeInSubtree (node, subtreeRoot) {
    while (node) {
      if (node === subtreeRoot)
	return true;
      node = node.parent;
    }
    return false;
  }
  
  // Get graph by analyzing parsed Bracery expression
  getLayoutGraph (app, rhs) {
    const mv = this;
    rhs = rhs || app.parseBracery();
    const text = this.nodesText (app, rhs);
    const symName = app.state.name;
    const startNodeName = this.SYM_PREFIX + symName;
    // Scan parsed Bracery code for top-level global variable assignments of the form $variable=&quote{...} or $variable=&let$_xy{...}&quote{...}
    let nodeOffset = 0, strOffset = 0, nodes = [], edges = [];
    while (nodeOffset < rhs.length && (ParseTree.isQuoteAssignExpr (rhs[nodeOffset]) || ParseTree.isLayoutAssign (rhs[nodeOffset]) || ParseTree.isPlaceholderExpr (rhs[nodeOffset]))) {
      let braceryNode = rhs[nodeOffset];
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
      if (coord) {
	const xy = coord.split(',');
	node.x = parseFloat (xy[0]);
	node.y = parseFloat (xy[1]);
      }
      nodes = nodes.filter ((n) => n.id !== node.id);
      if (node.nodeType === this.startNodeType)
	nodes = [node].concat (nodes);
      else
	nodes.push (node);
      strOffset = braceryNode.pos[0] + braceryNode.pos[1];
      ++nodeOffset;
    }

    // Add a start node for everything from the first character that is *not* part of a top-level global variable assignment
    let nodeByID = {};
    nodes.forEach ((node) => nodeByID[node.id] = node);
    if (!nodeByID[startNodeName]) {
      const startNode = { id: startNodeName,
	                  pos: [strOffset, 0],
                          nodeType: this.startNodeType };
      nodes = [startNode].concat (nodes);
      nodeByID[startNodeName] = startNode;
    }
    nodes[0].rhs = rhs.slice (nodeOffset);

    // Do some analysis of outgoing edges
    const getTargetNodes = (node, config, namePrefix) => {
      return ParseTree.getSymbolNodes (node.rhs, config)
        .map ((target) => extend (target, { graphNodeName: (namePrefix || '') + target.name.toLowerCase() }))
	.filter ((target) => target.graphNodeName !== node.id);
    };
    const getIncludedNodes = (node) => getTargetNodes (node, { traceryOnly: true, ignoreLink: true });
    const getLinkedNodes = (node) => getTargetNodes (node, { traceryOnly: true, linkOnly: true });
    const getExternalNodes = (node, linkFlag) => getTargetNodes (node,
                                                                 extend ({ ignoreTracery: true },
                                                                         typeof(linkFlag) === 'undefined'
                                                                         ? {}
                                                                         : (linkFlag
                                                                            ? { linkOnly: true }
                                                                            : { ignoreLink: true })),
                                                                 this.SYM_PREFIX);
    
    // Create placeholders for unknown & external nodes
    const createPlaceholders = (getter, attrs) => (node) => {
      getter(node).forEach ((target) => {
	const targetNode = nodeByID[target.graphNodeName];
        if (targetNode) {
	  if (!targetNode.parent && targetNode.nodeType !== mv.startNodeType)
	    targetNode.parent = node;
	} else {
          nodes.push (extend ({ id: target.graphNodeName,
                                pos: [strOffset, 0],
                                parent: node,
                                rhs: [] },
                              attrs));
          nodeByID[target.graphNodeName] = true;
        }
      });
    }
    nodes.forEach (createPlaceholders (getIncludedNodes, { nodeType: mv.placeholderNodeType }));
    nodes.forEach (createPlaceholders (getLinkedNodes, { nodeType: mv.placeholderNodeType }));
    nodes.forEach (createPlaceholders (getExternalNodes, { nodeType: mv.externalNodeType }));

    // Do some common initializing, and create edges
    let childPos = fromEntries (nodes.map ((node) => [node.id, {}]));
    const addEdge = ((edge) => {
      edges.push (edge);
      let srcChildPos = childPos[edge.source];
      if (!srcChildPos[edge.target])
	srcChildPos[edge.target] = Object.keys(srcChildPos).length;
    });
    nodes.forEach ((node) => {
      node.type = node.id;
      node.title = this.truncate ((node.nodeType === mv.externalNodeType
                                   ? ''
                                   : (node.nodeType === mv.placeholderNodeType
                                      ? mv.placeholderNodeText
                                      : (mv.nodesText (app, node.rhs)
                                         || mv.emptyNodeText))),
                                  this.maxNodeTitleLen);
      // Create outgoing edges
      getIncludedNodes (node)
        .concat (getExternalNodes (node, false))
        .forEach ((target) => addEdge ({ source: node.id,
                                         target: target.graphNodeName,
                                         type: mv.includeEdgeType }));
      getLinkedNodes (node)
        .concat (getExternalNodes (node, true))
        .forEach ((target) => addEdge ({ source: node.id,
                                         target: target.graphNodeName,
                                         type: mv.linkEdgeType,
                                         handleText: this.truncate (mv.nodeText (app, target.linkText, node.id),
                                                                    this.maxEdgeHandleLen) }));
    });
    
    // Create tree structure
    // Ensure every node (except start) has a parent, and sort children by the order that the parent->child edges appear
    // This keeps the automatic hierarchical layout stable when we add placeholders, etc.
    nodes.forEach ((node) => node.children = []);
    nodes.forEach ((node, n) => {
      if (n > 0) {
	node.parent = node.parent || nodes[0];  // if a node is not referenced by any other node, set its parent to be the start node
	node.parent.children.push (node);
      }
      node.depth = 0;
      for (let n = node; n.parent; n = n.parent)
	++node.depth;
    });
    nodes.forEach ((node) => {
      node.children = node.children.sort ((a,b) => childPos[node.id][a.id] - childPos[node.id][b.id]);
      node.children.forEach ((child, n) => { if (child.parent === node) child.childIndex = n; });
    });

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
    };
    nodes.forEach (layoutNode);

    // Return
    return { nodes,
	     edges,
             text,
	     strOffset };
  }

  // Event handlers
  makeNodeBracery (app, node, dx, dy) {
    const x = Math.round(node.x + (dx || 0)), y = Math.round(node.y + (dy || 0));
    switch (node.nodeType) {
    case this.externalNodeType:
      return '&placeholder' + ParseTree.symChar + node.id.replace(this.SYM_PREFIX,'') + '{' + x + ',' + y + '}\n';
    case this.placeholderNodeType:
      return '&placeholder' + ParseTree.varChar + node.id + '{' + x + ',' + y + '}\n';
    case this.startNodeType:
      return '&placeholder{' + x + ',' + y + '}\n';
    case this.definedNodeType:
      return '[' + node.id + '@' + x + ',' + y + '=>' + this.nodesText (app, node.rhs) + ']\n';
    default:
      return '';
    }
  }
  
  onUpdateNode (app, graph, node) {
    const mv = this;
    const newEvalText = graph.nodes.map ((graphNode) => (
      mv.nodeInSubtree (graphNode, node)
	? mv.makeNodeBracery(app,graphNode)
	: mv.nodeText(app,graphNode)
    )).join('') + graph.text.substr (graph.strOffset);
    app.setState ({ evalText: newEvalText });
  }
  
  // Render graph
  render() {
    const app = this.props.app;
    const rhs = this.props.rhs;
    const graph = this.getLayoutGraph (app, rhs);
//    console.warn(graph);
    const nodeTypes = fromEntries (
      graph.nodes.map (
        (node) => [
          node.id,
          ({ shapeId: '#' + node.id,
             typeText: node.id.replace (this.SYM_PREFIX, ParseTree.symChar),
	     shape: (
                 <symbol viewBox="0 0 25 10" id={node.id} key="0">
                 <rect x="0" y="0" width="25" height="10" className={node.nodeType+'-node'}></rect>
                 </symbol>
	     )
           })]));
    const edgeTypes = {
      include: {
	shapeId: "#includeEdge",
	shape: (
          <symbol viewBox="0 0 50 50" id="includeEdge" key="0">
            <circle cx="25" cy="25" r="8" fill="green"> </circle>
          </symbol>
	)
      },
      link: {
	shapeId: "#linkEdge",
	shape: (
          <symbol viewBox="0 0 100 100" id="linkEdge" key="1">
            <circle cx="50" cy="50" r="50" fill="currentcolor"></circle>
          </symbol>
	)
      },
    };
    return (<div className="mapview">
	    <GraphView
            nodeKey="id"
	    nodes={graph.nodes}
	    edges={graph.edges}
	    edgeTypes={edgeTypes}
	    nodeTypes={nodeTypes}
	    nodeSubtypes={{}}
            onUpdateNode={(node)=>this.onUpdateNode(app,graph,node)}
	    zoomLevel="1"
	    />
	    </div>);
  }
}

export default MapView;
