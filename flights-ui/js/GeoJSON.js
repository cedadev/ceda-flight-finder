var GeoJSON = function(geojson, options) {
    var _error = function( message ) {
        return {
            type: "Error",
            message: message
        };
    };

    var _ccw = function( path ) {
        var isCCW;
        var a = 0;
        var i;
        for (i = 0; i < path.length-2; i++) {
            a += ((path[i+1].lat() - path[i].lat()) * (path[i+2].lng() - path[i].lng()) - (path[i+2].lat() - path[i].lat()) * (path[i+1].lng() - path[i].lng()));
        }
        if(a > 0) {
            isCCW = true;
        }
        else{
            isCCW = false;
        }
        return isCCW;
    };

    var _copy = function(obj) {
        var i;
        var newObj = {};
        for(i in obj) {
            if(obj.hasOwnProperty(i)) {
                newObj[i] = obj[i];
            }
        }
        return newObj;
    };

    var _geometryToGoogleMaps = function(geojsonGeometry, options, geojsonProperties) {
        var i, j, k;
        var path, coord, ll;
        var exteriorDirection;
        var interiorDirection;

        var googleObj, opts = _copy(options);

        switch ( geojsonGeometry.type ) {
            case "Point":
                opts.position = new google.maps.LatLng(geojsonGeometry.coordinates[1], geojsonGeometry.coordinates[0]);
                googleObj = new google.maps.Marker(opts);

                if (geojsonProperties) {
                    googleObj.set("geojsonProperties", geojsonProperties);
                }

                break;

            case "MultiPoint":
                googleObj = [];
                for (i = 0; i < geojsonGeometry.coordinates.length; i++) {
                    opts.position = new google.maps.LatLng(geojsonGeometry.coordinates[i][1], geojsonGeometry.coordinates[i][0]);
                    googleObj.push(new google.maps.Marker(opts));
                }

                if (geojsonProperties) {
                    for (k = 0; k < googleObj.length; k++) {
                        googleObj[k].set("geojsonProperties", geojsonProperties);
                    }
                }

                break;

            case "LineString":
                path = [];
                googleObj = [];
                for (i = 0; i < geojsonGeometry.coordinates.length; i++) {
                    coord = geojsonGeometry.coordinates[i];
                    ll = new google.maps.LatLng(coord[1], coord[0]);
                    path.push(ll);
                }

                opts.path = path;
                googleObj.push(new google.maps.Polyline(opts));

                if (geojsonProperties) {
                    googleObj[0].set("geojsonProperties", geojsonProperties);
                }

                break;

            case "MultiLineString":
                googleObj = [];
                for (i = 0; i < geojsonGeometry.coordinates.length; i++) {
                    path = [];
                    for (j = 0; j < geojsonGeometry.coordinates[i].length; j++) {
                        coord = geojsonGeometry.coordinates[i][j];
                        ll = new google.maps.LatLng(coord[1], coord[0]);
                        path.push(ll);
                    }

                    opts.path = path;
                    googleObj.push(new google.maps.Polyline(opts));
                }

                if (geojsonProperties) {
                    for (k = 0; k < googleObj.length; k++) {
                        googleObj[k].set("geojsonProperties", geojsonProperties);
                    }
                }

                break;

            case "Polygon":
                var paths = [];
                for (i = 0; i < geojsonGeometry.coordinates.length; i++) {
                    path = [];
                    for (j = 0; j < geojsonGeometry.coordinates[i].length; j++) {
                        ll = new google.maps.LatLng(geojsonGeometry.coordinates[i][j][1], geojsonGeometry.coordinates[i][j][0]);
                        path.push(ll);
                    }

                    if (!i) {
                        exteriorDirection = _ccw(path);
                        paths.push(path);
                    } else if (i === 1) {
                        interiorDirection = _ccw(path);
                        if (exteriorDirection === interiorDirection) {
                            paths.push(path.reverse());
                        } else {
                            paths.push(path);
                        }
                    } else {
                        if (exteriorDirection === interiorDirection) {
                            paths.push(path.reverse());
                        } else {
                            paths.push(path);
                        }
                    }
                }

                opts.paths = paths;
                googleObj = new google.maps.Polygon(opts);
                if (geojsonProperties) {
                    googleObj.set("geojsonProperties", geojsonProperties);
                }

                break;

            case "MultiPolygon":
                googleObj = [];
                for (i = 0; i < geojsonGeometry.coordinates.length; i++) {
                    paths = [];
                    for (j = 0; j < geojsonGeometry.coordinates[i].length; j++) {
                        path = [];
                        for (k = 0; k < geojsonGeometry.coordinates[i][j].length; k++) {
                            ll = new google.maps.LatLng(geojsonGeometry.coordinates[i][j][k][1], geojsonGeometry.coordinates[i][j][k][0]);
                            path.push(ll);
                        }
                        if (!j) {
                            exteriorDirection = _ccw(path);
                            paths.push(path);
                        } else if (j === 1) {
                            interiorDirection = _ccw(path);
                            if (exteriorDirection === interiorDirection) {
                                paths.push(path.reverse());
                            } else {
                                paths.push(path);
                            }
                        } else {
                            if (exteriorDirection === interiorDirection) {
                                paths.push(path.reverse());
                            } else {
                                paths.push(path);
                            }
                        }
                    }
                    opts.paths = paths;
                    googleObj.push(new google.maps.Polygon(opts));
                }
                if (geojsonProperties) {
                    for (k = 0; k < googleObj.length; k++) {
                        googleObj[k].set("geojsonProperties", geojsonProperties);
                    }
                }
                break;

            case "GeometryCollection":
                googleObj = [];
                if (!geojsonGeometry.geometries) {
                    googleObj = _error("Invalid GeoJSON object: GeometryCollection object missing \"geometries\" member.");
                } else {
                    for (i = 0; i < geojsonGeometry.geometries.length; i++) {
                        googleObj.push(_geometryToGoogleMaps(geojsonGeometry.geometries[i], opts, geojsonProperties || null));
                    }
                }
                break;

            default:
                googleObj = _error("Invalid GeoJSON object: Geometry object must be one of \"Point\", \"LineString\", \"Polygon\" or \"MultiPolygon\".");
        }
        return googleObj;
    };

    var obj, i;
    var opts = options || {};
    switch (geojson.type) {
        case "FeatureCollection":
            if (!geojson.features) {
                obj = _error("Invalid GeoJSON object: FeatureCollection object missing \"features\" member.");
            } else {
                obj = [];
                for (i = 0; i < geojson.features.length; i++) {
                    obj.push(_geometryToGoogleMaps(geojson.features[i].geometry, opts, geojson.features[i].properties));
                }
            }
            break;

        case "GeometryCollection":
            if (!geojson.geometries) {
                obj = _error("Invalid GeoJSON object: GeometryCollection object missing \"geometries\" member.");
            } else {
                obj = [];
                for (i = 0; i < geojson.geometries.length; i++) {
                    obj.push(_geometryToGoogleMaps(geojson.geometries[i], opts));
                }
            }
            break;

        case "Feature":
            if (!(geojson.properties && geojson.geometry)) {
                obj = _error("Invalid GeoJSON object: Feature object missing \"properties\" or \"geometry\" member.");
            } else {
                obj = _geometryToGoogleMaps(geojson.geometry, opts, geojson.properties);
            }
            break;

        case "Point": case "MultiPoint": case "LineString": case "MultiLineString": case "Polygon": case "MultiPolygon":
            if (geojson.coordinates) {
                obj = _geometryToGoogleMaps(geojson, opts);
            } else {
                obj = _error("Invalid GeoJSON object: Geometry object missing \"coordinates\" member.");
            }

            break;

        default:
            obj = _error("Invalid GeoJSON object: GeoJSON object must be one of \"Point\", \"LineString\", \"Polygon\", \"MultiPolygon\", \"Feature\", \"FeatureCollection\" or \"GeometryCollection\".");
    }
    return obj;
};
