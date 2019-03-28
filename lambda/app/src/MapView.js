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
  get maxNodeTitleLen() { return 30; }
  get maxEdgeHandleLen() { return 10; }

  get placeholderNodeText() { return 'Double-click to add text'; }
  get emptyNodeText() { return '(empty)'; }
  
  // Helpers
  truncate (text, len) {
    return (text.length < len
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

  // Get graph by analyzing parsed Bracery expression
  getLayoutGraph (app, rhs) {
    const mv = this;
    rhs = rhs || app.parseBracery();
    const text = this.nodesText (app, rhs);
    const symName = app.state.name;
    // Scan parsed Bracery code for top-level global variable assignments of the form $variable=&quote{...} or $variable=&let$_xy{...}&quote{...}
    let nodeOffset = 0, strOffset = 0, nodes = [], edges = [], seenNode = {};
    while (nodeOffset < rhs.length && (ParseTree.isQuoteAssignExpr (rhs[nodeOffset]) || ParseTree.isLayoutAssign (rhs[nodeOffset]))) {
      let braceryNode = rhs[nodeOffset];
      let id = braceryNode.varname.toLowerCase();
      let node = { id: id,
		   pos: braceryNode.pos,
                   nodeType: 'defined' };
      if (ParseTree.isLayoutAssign (braceryNode)) {
	let expr = ParseTree.getLayoutExpr (braceryNode);
	let xy = ParseTree.getLayoutCoord (expr).split(',');
	node.x = parseFloat (xy[0]);
	node.y = parseFloat (xy[1]);
	node.rhs = ParseTree.getLayoutContent (expr);
      } else
	node.rhs = ParseTree.getQuoteAssignRhs (braceryNode);
      nodes.push (node);
      strOffset = braceryNode.pos[0] + braceryNode.pos[1];
      ++nodeOffset;
    }
    // Add a start node for everything from the first character that is *not* part of a top-level global variable assignment
    const startNode = { id: this.SYM_PREFIX + symName,
	                pos: [strOffset, app.state.evalText.length - strOffset],
	                rhs: rhs.slice (nodeOffset),
                        nodeType: 'start' };
    nodes = [startNode].concat (nodes);
    nodes.forEach ((node) => seenNode[node.id] = true);
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
        if (!seenNode[target.graphNodeName]) {
          nodes.push (extend ({ id: target.graphNodeName,
                                pos: [strOffset, 0],
                                parent: node,
                                rhs: [] },
                              attrs));
          seenNode[target.graphNodeName] = true;
        }
      });
    }
    nodes.forEach (createPlaceholders (getIncludedNodes, { nodeType: 'placeholder' }));
    nodes.forEach (createPlaceholders (getLinkedNodes, { nodeType: 'placeholder' }));
    nodes.forEach (createPlaceholders (getExternalNodes, { nodeType: 'external' }));

    // Lay things out
    nodes.forEach ((node, n) => {
      // If no (x,y) specified, lay out nodes on a circle of radius (this.layoutRadius)
      if (typeof(node.x) === 'undefined') {
        if (n > 0) {
	  const angle = 2 * Math.PI * (n - 1) / (nodes.length - 1);
	  node.x = Math.cos(angle) * mv.layoutRadius;
	  node.y = Math.sin(angle) * mv.layoutRadius;
        } else
          node.x = node.y = 0;
      }
      // Do some common initializing
      node.type = node.id;
      node.title = this.truncate ((node.nodeType === 'external'
                                   ? ''
                                   : (node.nodeType === 'placeholder'
                                      ? mv.placeholderNodeText
                                      : (mv.nodesText (app, node.rhs)
                                         || mv.emptyNodeText))),
                                  this.maxNodeTitleLen);
      // Create outgoing edges
      getIncludedNodes (node)
        .concat (getExternalNodes (node, false))
        .forEach ((target) => edges.push ({ source: node.id,
                                            target: target.graphNodeName,
                                            type: 'include' }));
      getLinkedNodes (node)
        .concat (getExternalNodes (node, true))
        .forEach ((target) => edges.push ({ source: node.id,
                                            target: target.graphNodeName,
                                            type: 'link',
                                            handleText: this.truncate (mv.nodeText (app, target.linkText, node.id),
                                                                       this.maxEdgeHandleLen) }));
    });
    return { nodes,
	     edges,
             text };
  }

  // Event handlers
  makeNodeBracery (app, node, dx, dy) {
    if (node.nodeType === 'external' || node.nodeType === 'placeholder')
      return '';
    return '[' + node.id + '@' + Math.round(node.x + (dx || 0)) + ',' + Math.round(node.y + (dy || 0)) + '=>' + this.nodesText (app, node.rhs) + ']\n';
  }
  
  onUpdateNode (app, graph, node) {
    const mv = this;
    switch (node.nodeType) {
    case 'defined':
      app.setState ({ evalText: graph.text.substr(0,node.pos[0]) + this.makeNodeBracery(app,node) + graph.text.substr(node.pos[0]+node.pos[1]) })
      break
    case 'start':
      const newEvalText = graph.nodes.slice(1).map ((other) => mv.makeNodeBracery (app, other, -node.x, -node.y)).join('')
        + this.nodesText (app, graph.nodes[0].rhs);
      app.setState ({ evalText: newEvalText });
      break
    case 'placeholder':
    case 'external':
    default:
      break
    }
  }
  
  // Render graph
  render() {
    const app = this.props.app;
    const rhs = this.props.rhs;
    const graph = this.getLayoutGraph (app, rhs);
    const nodeTypes = fromEntries (
      graph.nodes.map (
        (node, n) => [
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
