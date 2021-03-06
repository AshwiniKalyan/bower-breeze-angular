﻿//#region Copyright, Version, and Description
/*
 * Copyright 2013 IdeaBlade, Inc.  All Rights Reserved.  
 * Use, reproduction, distribution, and modification of this code is subject to the terms and 
 * conditions of the IdeaBlade Breeze license, available at http://www.breezejs.com/license
 *
 * Author: Ward Bell
 * Version: 1.0.1
 * --------------------------------------------------------------------------------
 * Adds metadataHelper extensions to Breeze
 * Source:
 * https://github.com/IdeaBlade/Breeze/blob/master/Breeze.Client/Scripts/Labs/breeze.metadata-helper.js
 *
 * Depends on Breeze which it patches
 *
 * You can use these helpers when creating metadata by hand 
 * to improve workflow and reduce data entry errors.
 *
 * The helpers reflect an opinion about developer workflow
 * that may or may not work for you.
 * Use these helpers "as is" or use for inspiration in creating your own.
 * 
 * For example usage, see:
 * https://github.com/IdeaBlade/Breeze/blob/master/Samples/DocCode/DocCode/tests/helpers/metadataOnClient.js
 *
 * For a discussion of how they work and why, see:
 * http://www.breezejs.com/documentation/metadata-by-hand#addTypeToStore
 *  
 */
//#endregion
(function (definition) {

    // CommonJS
    if (typeof exports === "object") {
        var b = require('breeze');
        definition(b);
    // RequireJS
    } else if (typeof define === "function") {
        define(['breeze'], definition);
    // <script>
    } else {
        definition(this.breeze);
    }
})
(function (breeze) {

    var helper = breeze.MetadataHelper = breeze.MetadataHelper || ctor;
      
    // MetadataHelper constructor ... unless already defined by someone else
    function ctor(defaultNamespace) {
        this.defaultNamespace = defaultNamespace;
    };
     
    // Add a member to the MetadataHelper prototype ... if member not already present.
    var addToHelper = function (name, fn) {
        if (!helper.prototype[name]) { helper.prototype[name] = fn; }
    }

    addToHelper('addDataService', addDataService);
    addToHelper('addTypeNameAsResource', addTypeNameAsResource);
    addToHelper('addTypeToStore', addTypeToStore); 
    addToHelper('convertValidators', convertValidators);
    addToHelper('inferValidators', inferValidators);
    addToHelper('patchDefaults', patchDefaults);
    addToHelper('setDefaultNamespace', setDefaultNamespace);
    addToHelper('_hasOwnProperty', _hasOwnProperty);
    addToHelper('_isArray', _isArray);

    var DT = breeze.DataType;
    var Identity = breeze.AutoGeneratedKeyType.Identity;
    var Validator = breeze.Validator;

    function addDataService(store, serviceName) {
        store.addDataService(
                new breeze.DataService({ serviceName: serviceName })
        );
    }

    // Create the type from the definition hash and add the type to the store
    // fixes some defaults, infers certain validators,
    // add adds the type's "shortname" as a resource name
    function addTypeToStore(store, typeDef) {
        patchDefaults(typeDef);
        var type = typeDef.isComplexType ?
            new breeze.ComplexType(typeDef) :
            new breeze.EntityType(typeDef);
        store.addEntityType(type);
        inferValidators(type);
        addTypeNameAsResource(store, type);

        return type;
    }

    // Often helpful to have the type's 'shortName' available as a resource name 
    // as when composing a query to be executed locally against the cache.
    // This function adds the type's 'shortName' as one of the resource names for the type.
    // Theoretically two types in different models could have the same 'shortName'
    // and thus we would associate the same resource name with the two different types.
    // While unlikely, breeze should offer a way to remove a resource name for a type.
    function addTypeNameAsResource(store, type) {
        if (!type.isComplexType) {
            store.setEntityTypeForResourceName(type.shortName, type);
        }
    }

    // While Breeze requires that the validators collection be defined with Validator instances
    // we support alternative expression of validators in JSON form (as if coming from the server)
    // Validator:
    //    phone: { maxLength: 24, validators: [ Validator.phone() ] },
    // JSON:
    //    phone: { maxLength: 24, validators: [ {name: 'phone'} ] },                
    // This fn converts JSON to a Validator instance
    function convertValidators(typeName, propName, propDef) {
        var validators = propDef.validators;
        if (!_isArray(validators)) {
            throw "{0}.{1}.validators must be an array".format(typeName, propName);
        }

        var Validator = breeze.Validator;
        validators.forEach(function (val, ix) {
            if (val instanceof Validator) return;
            try {
                validators[ix] = Validator.fromJSON(val);
            } catch (ex) {
                throw "{0}.{1}.validators[{2}] = '{3}' can't be converted to a known Validator."
                    .format(typeName, propName, ix, JSON.stringify(val));
            }
        });
    }

    function inferValidators(entityType) {

        entityType.dataProperties.forEach(function (prop) {
            if (!prop.isNullable) { // is required. 
                addValidator(prop, Validator.required());
            };

            addValidator(prop, getDataTypeValidator(prop));

            if (prop.maxLength != null && prop.dataType === DT.String) {
                addValidator(prop, Validator.maxLength({ maxLength: prop.maxLength }));
            }

        });

        return entityType;

        function addValidator(prop, validator) {
            if (!validator) { return; } // no validator arg
            var valName = validator.name;
            var validators = prop.validators;
            var found = validators.filter(function (val) { return val.name == valName; })
            if (!found.length) { // this validator has not already been specified
                validators.push(validator);
            }
        }

        function getDataTypeValidator(prop) {
            var dataType = prop.dataType;
            var validatorCtor = !dataType || dataType === DT.String ? null : dataType.validatorCtor;
            return validatorCtor ? validatorCtor() : null;
        }
    }

    // Patch some defaults in the type definition object
    // Todo: consider moving these patches into breeze itself
    function patchDefaults(typeDef) {
        var typeName = typeDef.shortName;
        // if no namespace specified, assign the defaultNamespace 
        var namespace = typeDef.namespace = typeDef.namespace || this.defaultNamespace;
        var dps = typeDef.dataProperties;
        for (var key in dps) {
            if (_hasOwnProperty(dps, key)) {
                var prop = dps[key];
                if (prop.complexTypeName && prop.complexTypeName.indexOf(":#") === -1) {
                    // if complexTypeName is unqualified, suffix with the entity's own namespace
                    prop.complexTypeName += ':#' + namespace;
                }
                // assume key part is non-nullable ... unless explicitly declared nullable (when is that good?)
                prop.isNullable = prop.isNullable == null ? !prop.isPartOfKey : !!prop.isNullable;

                if (prop.validators) { convertValidators(typeName, key, prop); }
            }
        };

        var navs = typeDef.navigationProperties;
        for (var key in navs) {
            if (_hasOwnProperty(navs, key)) {
                var prop = navs[key];
                if (prop.entityTypeName.indexOf(":#") === -1) {
                    // if name is unqualified, suffix with the entity's own namespace
                    prop.entityTypeName += ':#' + namespace;
                }
            }
        };
    }

    function setDefaultNamespace(namespace) {
        this.defaultNamespace = namespace;
    }

    function _hasOwnProperty(obj, key) {
        return Object.prototype.hasOwnProperty.call(obj, key)
    }

    function _isArray(obj) {
        return Object.prototype.toString.call(obj) === '[object Array]';
    }

});