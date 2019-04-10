// @flow
/*
  Copyright(c) 2018 Uber Technologies, Inc.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

          http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

/*
  Zoom slider and zoom to fit controls for GraphView
*/

import React from 'react';
import Parse from 'html-react-parser';

import faExpand from '../icons/expand';
import faNew from '../icons/plus';
import faDelete from '../icons/trash-can';

const steps = 100; // Slider steps
const [ExpandIcon, NewIcon, DeleteIcon]
      = [faExpand, faNew, faDelete]
      .map ((svgStr) => {
        const parsedSvg = Parse(svgStr); //  parse SVG once
        return () => parsedSvg; // convert SVG to react component
      });

type IGraphControlProps = {
  maxZoom?: number;
  minZoom?: number;
  zoomLevel: number;
  zoomToFit: (event: SyntheticMouseEvent<HTMLButtonElement>) => void;
  modifyZoom: (delta: number) => boolean;
  createNode: (x: number, y: number) => void;
  deleteSelected: () => void;
  canDeleteSelected: boolean;
}

class GraphControls extends React.Component<IGraphControlProps> {
  static defaultProps = {
    maxZoom: 1.5,
    minZoom: 0.15
  };

  // eslint-disable-next-line
  constructor(props: IGraphControlProps) {
    super(props);
  }

  // Convert slider val (0-steps) to original zoom value range
  sliderToZoom(val: number) {
    const { minZoom, maxZoom } = this.props;
    return val * ((maxZoom || 0) - (minZoom || 0)) / steps + (minZoom || 0);
  }

  // Convert zoom val (minZoom-maxZoom) to slider range
  zoomToSlider(val: number) {
    const { minZoom, maxZoom } = this.props;
    return (val - (minZoom || 0)) * steps / ((maxZoom || 0) - (minZoom || 0));
  }

  // Modify current zoom of graph-view
  zoom = (e: any) => {
    const { minZoom, maxZoom } = this.props;
    const sliderVal = e.target.value;
    const zoomLevelNext = this.sliderToZoom(sliderVal);
    const delta = zoomLevelNext - this.props.zoomLevel;

    if (zoomLevelNext <= (maxZoom || 0) && zoomLevelNext >= (minZoom || 0)) {
      this.props.modifyZoom(delta);
    }
  };

  render() {
    return (
      <div className="graph-controls">
        <div className="slider-wrapper">
          <span>-</span>
          <input
            type="range"
            className="slider"
            min={this.zoomToSlider(this.props.minZoom || 0)}
            max={this.zoomToSlider(this.props.maxZoom || 0)}
            value={this.zoomToSlider(this.props.zoomLevel)}
            onChange={this.zoom}
            step="1"
          />
          <span>+</span>
        </div>
        <button
          type="button"
          className="slider-button"
          onMouseDown={this.props.zoomToFit}
        >
          <ExpandIcon />
        </button>
        <button
          type="button"
          className="slider-button"
          onClick={this.props.createNode}
        >
          <NewIcon />
        </button>
        {this.props.canDeleteSelected
         ? (<button
            type="button"
            className="slider-button"
            onClick={this.props.deleteSelected}
            >
            <DeleteIcon />
            </button>)
         : ''
        }
      </div>
    );
  }
}

export default GraphControls;
