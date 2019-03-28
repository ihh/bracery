import React, { Component } from 'react';
import { Bracery, ParseTree } from 'bracery';
import braceryWeb, { extend } from './bracery-web';
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
  // Get graph by analyzing parsed Bracery expression
  getLayoutGraph (app, rhs) {
    rhs = rhs || app.parseBracery();
    // Scan parsed Bracery code for top-level global variable assignments of the form $variable=&quote{...} or $variable=&let$_xy{...}&quote{...}
    let nodeOffset = 0, strOffset = 0, nodes = [], edges = [], seenNode = {};
    while (nodeOffset < rhs.length && (ParseTree.isQuoteAssignExpr (rhs[nodeOffset]) || ParseTree.isLayoutAssign (rhs[nodeOffset]))) {
      let braceryNode = rhs[nodeOffset];
      let id = braceryNode.varname.toLowerCase();
      let node = { id: id,
		   pos: braceryNode.pos };
      if (ParseTree.isLayoutAssign (braceryNode)) {
	let expr = ParseTree.getLayoutExpr (braceryNode);
	let xy = ParseTree.getLayoutCoord (expr).split(',');
	node.x = parseFloat (xy[0]);
	node.y = parseFloat (xy[1]);
	node.rhs = ParseTree.getLayoutContent (expr);
      } else
	node.rhs = ParseTree.getQuoteAssignRhs (braceryNode);
      nodes.push (node);
      seenNode[id] = true;
      strOffset = braceryNode.pos[0] + braceryNode.pos[1];
      ++nodeOffset;
    }
    // Add a start node for everything from the first character that is *not* part of a top-level global variable assignment
    nodes = [{ id: app.startNodeName,
	       pos: [strOffset, app.state.evalText.length - strOffset],
	       rhs: rhs.slice (nodeOffset) }].concat (nodes);
    // Do some analysis of outgoing edges
    const getTargetNodes = (node, config) => {
      return ParseTree.getSymbolNodes (node.rhs, config)
        .map ((target) => extend (target, { name: target.name.toLowerCase() }))
	.filter ((target) => target.name !== node.id);
    };
    const getIncludedNodes = (node) => getTargetNodes (node, { traceryOnly: true, ignoreLink: true });
    const getLinkedNodes = (node) => getTargetNodes (node, { traceryOnly: true, linkOnly: true });
    // Find unknown nodes
    let unknownNodeOffsetAngle = 0, unknownNodeOffsetAngleInc = 1, unknownNodeOffsetRadius = app.layoutRadius / 3;
    const createPlaceholders = (getter) => (node) => {
      getter(node).forEach ((target) => {
        if (!seenNode[target.name]) {
          nodes.push ({ id: target.name,
                        pos: [strOffset, 0],
                        placeholder: true,
                        parent: node,
                        rhs: [] });
          seenNode[target.name] = true;
        }
      });
    }
    nodes.forEach (createPlaceholders (getIncludedNodes));
    nodes.forEach (createPlaceholders (getLinkedNodes));

    // Lay things out
    nodes.forEach ((node, n) => {
      // If no (x,y) specified, lay out nodes on a circle of radius (app.layoutRadius)
      if (typeof(node.x) === 'undefined') {
        if (n > 0) {
	  const angle = 2 * Math.PI * (n - 1) / (nodes.length - 1);
	  node.x = Math.cos(angle) * app.layoutRadius;
	  node.y = Math.sin(angle) * app.layoutRadius;
        } else
          node.x = node.y = 0;
      }
      // Do some common initializing
      node.type = node.id;
      node.title = app.truncate (app.nodesText (node.rhs,
                                                node.id.replace(/_/g,'')),
                                app.maxNodeTitleLen);
      // Create outgoing edges
      getIncludedNodes (node)
        .forEach ((target) => edges.push ({ source: node.id, target: target.name, type: 'include' }));
      getLinkedNodes (node)
        .forEach ((target) => edges.push ({ source: node.id, target: target.name, type: 'link', handleText: app.truncate (app.nodeText (target.linkText, node.id), app.maxEdgeHandleLen) }));
    });
    return { nodes,
	     edges };
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
          (n === 0
           ? { shapeId: '#' + node.id,
               typeText: node.id,
               shape: (
                   <symbol viewBox="0 0 50 20" id={node.id} key="0">
                   <ellipse cx="25" cy="10" rx="22" ry="10" className="start-node"></ellipse>
                   </symbol>
               )
             }
           : { shapeId: '#' + node.id,
               typeText: node.id,
	       shape: (
                   <symbol viewBox="0 0 25 10" id={node.id} key="0">
                   <rect x="0" y="0" width="25" height="10" className={node.placeholder?'unknown-placeholder-node':'defined-node'}></rect>
                   </symbol>
	       )
             })]));
    console.warn({nodeTypes});
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
	    zoomLevel="1"
	    />
	    </div>);
  }
}

export default MapView;
